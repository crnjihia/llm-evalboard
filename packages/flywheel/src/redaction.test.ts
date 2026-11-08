import { describe, expect, it } from "vitest";
import { passesLuhn, scrubObject, scrubText } from "./redaction.js";

describe("PII Redaction Pipeline", () => {
  describe("Luhn Algorithm Checksum", () => {
    it("validates known valid credit card numbers", () => {
      // Standard test Visa number
      expect(passesLuhn("4532015112830366")).toBe(true);
      // Formatted with spaces / dashes
      expect(passesLuhn("4532-0151-1283-0366")).toBe(true);
      expect(passesLuhn("4532 0151 1283 0366")).toBe(true);
    });

    it("rejects invalid numbers failing checksum", () => {
      expect(passesLuhn("4532015112830367")).toBe(false);
      expect(passesLuhn("1234567890123456")).toBe(false);
      expect(passesLuhn("12345")).toBe(false); // too short
    });
  });

  describe("scrubText", () => {
    it("redacts email addresses", () => {
      const input = "Contact our support lead at alice.smith@example.org for account help.";
      const res = scrubText(input);
      expect(res.text).toBe("Contact our support lead at [EMAIL] for account help.");
      expect(res.redactedCount).toBe(1);
      expect(res.detectedTypes).toContain("EMAIL");
    });

    it("redacts US Social Security Numbers", () => {
      const input = "Employee SSN is 123-45-6789 on the W-2 filing.";
      const res = scrubText(input);
      expect(res.text).toBe("Employee SSN is [SSN] on the W-2 filing.");
      expect(res.redactedCount).toBe(1);
      expect(res.detectedTypes).toContain("SSN");
    });

    it("redacts credit card numbers only if they pass Luhn", () => {
      const validCard = "Payment charged to 4532-0151-1283-0366 successfully.";
      const validRes = scrubText(validCard);
      expect(validRes.text).toBe("Payment charged to [CREDIT_CARD] successfully.");
      expect(validRes.detectedTypes).toContain("CREDIT_CARD");

      const invalidCard = "Reference ID 1234-5678-9012-3456 generated.";
      const invalidRes = scrubText(invalidCard);
      expect(invalidRes.text).toBe("Reference ID 1234-5678-9012-3456 generated.");
      expect(invalidRes.detectedTypes).not.toContain("CREDIT_CARD");
    });

    it("redacts phone numbers in various formats", () => {
      const input = "Call me at +1 (555) 234-5678 or 555-876-5432 ext 102.";
      const res = scrubText(input);
      expect(res.text).toContain("[PHONE]");
      expect(res.detectedTypes).toContain("PHONE");
    });

    it("redacts OpenAI API keys and Bearer tokens", () => {
      const input =
        "Authorization: Bearer mySecretToken123456789012345 with API sk-proj12345678901234567890abcdef.";
      const res = scrubText(input);
      expect(res.text).toContain("Bearer [API_KEY]");
      expect(res.text).toContain("[API_KEY]");
      expect(res.detectedTypes).toContain("API_KEY");
    });

    it("redacts IPv4 and IPv6 addresses", () => {
      const input = "Connecting from 192.168.1.45 to production gateway.";
      const res = scrubText(input);
      expect(res.text).toBe("Connecting from [IP_ADDRESS] to production gateway.");
      expect(res.detectedTypes).toContain("IP_ADDRESS");
    });

    it("supports custom redaction rules", () => {
      const input = "Patient ID MRN-998877 admitted to Ward B.";
      const customRules = [
        {
          name: "MRN",
          pattern: /\bMRN-\d{6}\b/g,
          replacement: "[MEDICAL_RECORD_NUM]",
        },
      ];
      const res = scrubText(input, customRules);
      expect(res.text).toBe("Patient ID [MEDICAL_RECORD_NUM] admitted to Ward B.");
      expect(res.detectedTypes).toContain("MRN");
    });
  });

  describe("scrubObject", () => {
    it("recursively scrubs strings in nested JSON while preserving object keys", () => {
      const payload = {
        userId: "usr_123",
        profile: {
          email: "john.doe@company.com",
          phone: "555-345-6789",
          billing: {
            cardNumber: "4532 0151 1283 0366",
            amount: 99.95,
            active: true,
          },
        },
        tags: ["admin", "reach at admin@company.com"],
      };

      const res = scrubObject(payload);
      expect(res.totalRedactions).toBe(4); // 2 emails + 1 phone + 1 card
      expect(res.redacted.profile.email).toBe("[EMAIL]");
      expect(res.redacted.profile.phone).toBe("[PHONE]");
      expect(res.redacted.profile.billing.cardNumber).toBe("[CREDIT_CARD]");
      expect(res.redacted.profile.billing.amount).toBe(99.95);
      expect(res.redacted.profile.billing.active).toBe(true);
      expect(res.redacted.tags[1]).toBe("reach at [EMAIL]");
    });
  });
});
