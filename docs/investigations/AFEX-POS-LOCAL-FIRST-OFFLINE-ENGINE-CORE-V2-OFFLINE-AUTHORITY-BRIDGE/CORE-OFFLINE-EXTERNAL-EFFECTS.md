# External effects

The bridge defines immutable intents for `whatsapp`, `printing`, `notification` and `other` effects.

Identity is:

`serverCommandId + ":" + effectType + ":" + effectVersion`

Every intent has `executionAllowed: false`. The bridge does not execute, enqueue, dispatch or retry effects. Page replay, refresh, Service Worker activity and local qualification cannot trigger an effect. The production `externalEffects` flag is hard-coded false and cannot be enabled through an environment variable.
