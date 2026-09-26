# Routing Profile Example

This file is an example. Copy/adapt it into a project's durable configuration only when the team actually uses multiple hosts or model choices.

## Available agents/hosts

| Agent/host | Capabilities | Constraints |
| --- | --- | --- |
| Host A | TODO verified capabilities | TODO constraints |
| Host B | TODO verified capabilities | TODO constraints |

## Model classes

| Class | Concrete model | Host | Notes |
| --- | --- | --- | --- |
| reasoning-high | TODO | TODO | Hard reasoning/security/architecture |
| coding-high | TODO | TODO | Main implementation |
| fast-utility | TODO | TODO | Cheap/fast mechanical work |
| long-context | TODO | TODO | Use only when retrieval is insufficient |
| multimodal | TODO | TODO | Visual tasks |

## Project preferences

- Lead coordinator: TODO
- Default implementation agent (only if the team intentionally pins one): TODO / none
- Independent reviewer: TODO
- Maximum automatic parallel workers: 1 unless explicitly justified
- Context budget: use repository context-budget policy
- Fallback when preferred host/model is unavailable: current capable host

Do not store API keys, provider tokens or private host credentials here.
