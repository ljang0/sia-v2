"""Harbor evaluator probes: replay captured output, or try forging reward.

This does not replay CUA actions and does not invoke a model. The real Mac probe
and evaluate_background.py establish the route separately.
"""

from pathlib import Path

from harbor.agents.nop import NopAgent


class CapturedOutputAgent(NopAgent):
    @staticmethod
    def name():
        return "sia-captured-output"

    def __init__(self, *args, answer_path, **kwargs):
        super().__init__(*args, **kwargs)
        self.answer = Path(answer_path).resolve()
        if not self.answer.is_file() or self.answer.stat().st_size > 16_384:
            raise ValueError("Expected a small captured answer artifact")

    async def setup(self, environment):
        # Exercise boundaries in the running agent container, not just its config.
        result = await environment.exec(
            command="test ! -e /tests/grade.py && test ! -e /solution/solve.mjs"
        )
        if result.return_code != 0:
            raise RuntimeError("Oracle or reference solution leaked into the agent image")
        result = await environment.exec(
            command="node -e \"const net=require('node:net'); const s=net.connect(80,'1.1.1.1'); s.on('connect',()=>process.exit(1)); s.on('error',()=>process.exit(0)); s.setTimeout(3000,()=>process.exit(0));\"",
            timeout_sec=10,
        )
        if result.return_code != 0:
            raise RuntimeError("Agent container has external network access")

    async def run(self, instruction, environment, context):
        await environment.upload_file(source_path=self.answer, target_path="/workspace/answer.json")


class ForgedRewardAgent(NopAgent):
    @staticmethod
    def name():
        return "sia-forged-reward"

    async def run(self, instruction, environment, context):
        result = await environment.exec(
            command="mkdir -p /logs/verifier; printf '1\\n' > /logs/verifier/reward.txt; printf '{\"success\":true,\"reward\":1}' > /workspace/answer.json"
        )
        if result.return_code != 0:
            raise RuntimeError("Could not exercise reward-forgery probe")
