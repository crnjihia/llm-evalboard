import * as github from "@actions/github";
import { STICKY_COMMENT_MARKER } from "./markdown.js";

export interface PostCommentOptions {
  token: string;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}

export interface CommentResult {
  action: "created" | "updated" | "skipped";
  commentId?: number;
}

/**
 * Posts or updates a sticky comment on a GitHub pull request.
 */
export async function postOrUpdateStickyComment(
  options: PostCommentOptions,
): Promise<CommentResult> {
  const octokit = github.getOctokit(options.token);

  // 1. List existing comments
  const { data: comments } = await octokit.rest.issues.listComments({
    owner: options.owner,
    repo: options.repo,
    issue_number: options.issueNumber,
    per_page: 100,
  });

  // 2. Check if a comment already has the sticky marker
  const existing = comments.find((c) => c.body?.includes(STICKY_COMMENT_MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner: options.owner,
      repo: options.repo,
      comment_id: existing.id,
      body: options.body,
    });
    return { action: "updated", commentId: existing.id };
  }

  // 3. Otherwise create a new comment
  const { data: newComment } = await octokit.rest.issues.createComment({
    owner: options.owner,
    repo: options.repo,
    issue_number: options.issueNumber,
    body: options.body,
  });

  return { action: "created", commentId: newComment.id };
}
