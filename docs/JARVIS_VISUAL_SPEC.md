# Stable Jarvis Particle Visual

The uploaded reference video is interpreted as a motion specification, not as an asset to copy.

- One centered volumetric particle sphere.
- Permanent deterministic base positions.
- Slow breathing and rotation in idle.
- Noise-floor-controlled microphone response in listening.
- Organized inward compression in thinking.
- Actual playback-amplitude response in speaking.
- Bounded displacement so particles cannot escape across the dashboard.
- A small controlled central glow, never a large white flare.
- One active canvas: launcher, compact dock, or workspace—never duplicates.
- Compact desktop dock is fixed to the lower right; it is not a full-width horizontal page section.
- Mobile uses a bottom sheet.

The current implementation uses Canvas 2D and deterministic Fibonacci-sphere projection to avoid new frontend dependencies. It can later be replaced by a GPU shader while preserving the same component and state contracts.
