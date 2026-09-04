from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


class PagesReadyContractTests(unittest.TestCase):
    def test_github_action_verifies_and_calls_fixed_callback(self):
        action = (ROOT / ".github" / "workflows" / "generate-static-pages.yml").read_text(encoding="utf-8")
        self.assertIn("item_id:", action)
        self.assertIn("scripts/verify_static_item.py", action)
        self.assertIn("https://tasks.nukeador.com/webhook/segundavida/pages-ready", action)
        self.assertIn("SEGUNDAVIDA_N8N_CALLBACK_TOKEN", action)
        self.assertIn("retrying source generation", action)
        self.assertNotIn("resume_url", action)

    def test_callback_builder_emits_valid_source_with_normalization_in_chain(self):
        result = subprocess.run(
            ["node", "scripts/build_sv_pages_ready_workflow.mjs"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        source = result.stdout
        self.assertIn("Segunda Vida Pages callback", source)
        self.assertIn("authentication: 'headerAuth'", source)
        self.assertIn("where: expr(", source)
        self.assertIn(".add(normalizeRow).to(itemFound", source)
        self.assertIn("telegram_message_id", source)
        self.assertNotIn("resumeUrl", source)


if __name__ == "__main__":
    unittest.main()
