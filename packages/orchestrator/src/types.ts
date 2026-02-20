export type ProjectConfig = {
  base_branch: string;
  test_cmd: string;
  lint_cmd: string;
  format_cmd: string;
  pr_template: string;
  package_manager: "pnpm" | "npm" | "yarn";
  plugins?: {
    npm?: string[];
  };
  policies?: {
    forbidden_stages?: string[];
    require_test_stage_before_github?: boolean;
    max_retries_per_stage?: number;
  };
};

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  base_branch: "main",
  test_cmd: "pnpm test",
  lint_cmd: "pnpm lint",
  format_cmd: "pnpm -r format",
  pr_template: ".github/pull_request_template.md",
  package_manager: "pnpm",
  policies: {
    forbidden_stages: [],
    require_test_stage_before_github: true,
    max_retries_per_stage: 0
  }
};
