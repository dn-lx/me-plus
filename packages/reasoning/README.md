# @me-plus/reasoning

Provider-neutral reasoning interfaces, domain-policy evaluation and structured reasoning contracts live here.

## Rules

- Model providers are replaceable dependencies.
- Reasoning outputs are derived state, never canonical user memory.
- Retrieve only the context needed for the task.
- Apply domain policies before proposing or executing external side effects.
- Prefer structured inputs/outputs that can be validated, logged safely and tested.
