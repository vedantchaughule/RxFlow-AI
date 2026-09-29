# RxFlow AI — High-Fidelity Jarvis Visual and ElevenLabs Voice Implementation Prompt

## Role

You are a senior frontend graphics engineer, real-time audio engineer, and React/TypeScript architect working inside the existing RxFlow AI clinic SaaS.

Your task is to replace the current low-quality Jarvis prototype with an original, high-fidelity, cinematic AI assistant visual system and connect it to ElevenLabs voice output without exposing any provider API key.

Do not redesign the whole RxFlow product. Preserve the existing dashboard, authentication, clinic workflows, Jarvis backend endpoints, doctor permissions, patient lookup, queue tools, inventory tools, prescription review, communication status, and manual fallback.

---

# 1. Read the project before changing code

Inspect the real repository first.

At minimum inspect:

```text
frontend/package.json
frontend/src/App.tsx
frontend/src/api.ts
frontend/src/auth.tsx
frontend/src/styles.css
frontend/src/theme.tsx
frontend/src/ui/**
frontend/src/features/jarvis/**
frontend/src/features/prescriptions/**
backend/package.json
backend/src/app.ts
backend/src/config/env.ts
backend/src/modules/jarvis/**
jarvis-agent/**
```

Also inspect the current visual implementation shown in the application:

- Right-side dark panel over the clinic settings page
- Large static hexagonal outline
- Small cyan oval in the center
- Separate glowing orb near the bottom
- A second floating orb outside the panel
- Debug-style `STATE: idle` text
- Layout overflow and weak visual hierarchy

Do not preserve this visual structure.

Before coding, report:

1. Which Jarvis routes and state types already exist.
2. Which frontend components already exist.
3. Which visual parts are placeholders.
4. Whether ElevenLabs is already installed.
5. Whether the current agent uses OpenAI, Gemini, or a provider-neutral backend.
6. Which parts can be reused safely.

---

# 2. Visual interpretation of the uploaded references

The uploaded video is the main motion reference.

It shows:

- A dark, nearly black background.
- One centered spherical volume made from thousands of tiny particles.
- Particles form a soft three-dimensional ball rather than a flat ring.
- The particle cloud expands and contracts.
- Particle density changes across the sphere.
- Small points move at different speeds.
- The sphere changes from cool white/cyan to warm gold/orange.
- Motion feels organic, fluid, and audio-reactive.
- Controls remain minimal and secondary.

The second prototype image is a workflow reference, not the final visual quality target.

It defines these states:

```text
idle
listening
thinking
speaking
response_complete
```

Keep this state workflow, but replace the flat ring graphics with a realistic volumetric particle core.

Do not copy Marvel logos, Iron Man armor, the arc reactor, movie HUD layouts, actor likenesses, actor voices, or copyrighted sounds.

Create an original cinematic clinical intelligence system.

---

# 3. Two user access modes

The same Jarvis engine must support two interfaces.

## Mode A — Full-screen Jarvis workspace

Add a doctor-only sidebar item:

```text
Jarvis Assistant
```

Suggested route:

```text
/app/jarvis
```

Full-screen layout:

- Nearly black background.
- No clinic form cards behind the visualization.
- Large centered particle intelligence core.
- Transcript and result cards remain minimal.
- Patient, queue, inventory, and prescription cards appear around or below the core only when needed.
- Main orb remains the dominant element.
- Clear close/back control.
- Keyboard input option.
- Push-to-talk control.
- Visible state label.
- Conversation history can be collapsed.

This mode is the premium cinematic experience.

## Mode B — Compact Jarvis dock

Add a small floating icon in the dashboard.

When closed:

- 48–64 px particle orb or simplified glowing core.
- Bottom-right position.
- Must not cover navigation or primary actions.
- Show a small status dot only when useful.

When opened:

- 360–440 px compact window on desktop.
- Bottom sheet on mobile.
- Uses the same particle engine at reduced quality and particle count.
- Supports voice, text, patient lookup, queue count, inventory search, and draft cards.
- Must not dim or block the entire dashboard unless showing a required confirmation.
- Must be resizable only if this can be implemented accessibly.

Both modes must use the same:

- state machine
- agent session
- transcript
- pending action
- voice playback
- visual renderer
- doctor-confirmation rules

Do not create two separate implementations.

---

# 4. Recommended graphics stack

Use the existing React and Vite application.

Add only the packages actually required after checking current compatible versions and security advisories:

```text
three
@react-three/fiber
@react-three/drei
@react-three/postprocessing
```

Use:

- React Three Fiber for the scene.
- Three.js `BufferGeometry` for the particle cloud.
- A custom GLSL `ShaderMaterial` for particle position, size, color, and alpha.
- Bloom only on emissive particles and the central core.
- Web Audio API for real microphone and playback analysis.
- CSS for surrounding interface cards and controls.

Do not generate thousands of React particle components.

Use one or a small number of GPU draw calls.

Do not use a static GIF, MP4, animated PNG, Lottie imitation, or prerecorded state animation as the primary visual.

---

# 5. Component structure

Create or refactor toward:

```text
frontend/src/features/jarvis/
├── JarvisProvider.tsx
├── JarvisLauncher.tsx
├── JarvisDock.tsx
├── JarvisWorkspace.tsx
├── JarvisSurface.tsx
├── JarvisParticleCore/
│   ├── JarvisParticleCore.tsx
│   ├── ParticleSphere.tsx
│   ├── ParticleHalo.tsx
│   ├── EnergyCore.tsx
│   ├── particle.vertex.glsl
│   ├── particle.fragment.glsl
│   ├── particle-presets.ts
│   ├── particle-quality.ts
│   └── particle.types.ts
├── JarvisControls.tsx
├── JarvisTranscript.tsx
├── JarvisResultCards.tsx
├── JarvisConfirmation.tsx
├── JarvisStatusLabel.tsx
├── JarvisTextInput.tsx
├── JarvisVoiceSettings.tsx
├── jarvis.machine.ts
├── jarvis.api.ts
├── jarvis.types.ts
├── useJarvisSession.ts
├── useJarvisVoice.ts
├── useMicrophoneAnalyser.ts
├── usePlaybackAnalyser.ts
├── useVisibilityPause.ts
├── useReducedMotion.ts
├── jarvis.css
└── VISUAL_SYSTEM.md
```

Reuse existing files when they already provide these responsibilities.

Do not duplicate working logic.

---

# 6. One state machine

Use one explicit state machine or reducer.

Required states:

```ts
type JarvisVisualState =
  | "off"
  | "booting"
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "tool_running"
  | "needs_confirmation"
  | "speaking"
  | "success"
  | "warning"
  | "error"
  | "disconnected";
```

Do not model these with many unrelated booleans.

State changes must be driven by real application events:

- microphone opened
- speech detected
- recording stopped
- transcript received
- agent request started
- backend tool started
- backend tool finished
- confirmation required
- audio playback started
- audio playback ended
- workflow succeeded
- request failed
- session disconnected

Do not use fake timers to pretend that Jarvis is listening, thinking, or speaking.

---

# 7. High-fidelity particle intelligence core

## Core form

Build one volumetric spherical intelligence made from GPU particles.

Desktop full-screen target:

- 28,000–60,000 particles depending on measured device performance.
- Spherical distribution with non-uniform density.
- Several subtle layers:
  - dense inner particle shell
  - sparse outer particle halo
  - low-opacity orbital dust
  - restrained core glow
- Soft depth, parallax, and perspective.
- No obvious flat circle.
- No large static hexagon.
- No cartoon outline.
- No duplicate floating orb.

Compact target:

- 6,000–15,000 particles.
- Same shader and behavior.
- Reduced bloom and outer dust.
- Preserve the visual identity.

## Particle generation

Generate deterministic base positions once.

Store at minimum:

- base position
- random seed
- size seed
- phase seed
- color mix seed
- layer identifier

Do not recreate arrays every frame.

Use typed arrays and `BufferAttribute`.

## Shader behavior

Drive particle displacement in the vertex shader.

Use a combination of:

- spherical base position
- layered procedural noise
- curl-like rotational flow
- radial breathing
- audio band displacement
- state transition interpolation
- per-particle phase offsets

Uniforms should include:

```ts
uTime
uStateMix
uAmplitude
uLow
uMid
uHigh
uSpeechActivity
uRadius
uTurbulence
uFlowSpeed
uPointScale
uColorA
uColorB
uCoreIntensity
uReducedMotion
```

Avoid CPU-updating every particle.

## Particle appearance

Particles should be:

- tiny
- sharp in the center
- softly luminous at the edge
- depth-aware
- slightly varied in size
- additive or carefully blended
- not oversized dots
- not confetti
- not a fuzzy blob

Use a soft circular point sprite in the fragment shader.

Discard nearly transparent fragment edges.

Avoid excessive bloom that merges the sphere into a bright ball.

---

# 8. Audio-reactive motion

The visualization must react to real sound.

## Microphone input

Use:

```text
navigator.mediaDevices.getUserMedia
AudioContext
MediaStreamAudioSourceNode
AnalyserNode
```

Calculate:

- RMS or comparable loudness from time-domain data
- low-frequency energy
- mid-frequency energy
- high-frequency energy
- speech activity
- smoothed peak

Suggested analyser baseline:

```text
fftSize: 1024 or 2048
smoothingTimeConstant: approximately 0.72–0.86
```

Tune after testing.

Never feed raw unsmoothed values directly into the shader.

Apply:

- attack smoothing for fast response
- slower release smoothing
- clamping
- noise floor
- silence threshold
- normalization

## Playback output

Jarvis must react to its own ElevenLabs audio.

Connect the returned or streamed audio to an analyser path.

When possible:

```text
ElevenLabs stream
→ MediaSource / audio element / Web Audio buffer
→ AnalyserNode
→ audio destination
```

Drive the speaking state from the actual output audio amplitude.

Do not play a generic looping speaking animation disconnected from the sound.

## Visual mapping

Map sound carefully:

```text
overall amplitude → global radius and core brightness
low frequencies   → heavy radial pulse
mid frequencies   → particle flow speed and wave width
high frequencies  → fine particle shimmer
speech activity   → turbulence and halo density
```

Use restrained limits.

The sphere should feel powerful, not chaotic.

---

# 9. Visual states

## Off

- Renderer unmounted or fully paused.
- No animation loop.
- Small launcher remains available.

## Booting

- Sparse particles converge into a sphere.
- Core fades in.
- Duration 600–900 ms.
- Skip or shorten on repeated opening.

## Idle

- Deep black background.
- Cool cyan/teal particle palette.
- Slow breathing.
- Very low turbulence.
- Outer particles drift slowly.
- The core should appear alive but calm.

Suggested colors:

```text
background: #020408 to #05090f
cyan:       #23e6df
teal:       #00a99d
soft blue:  #3a8dff
```

## Listening

- Sphere expands slightly.
- Particle velocity responds to the doctor’s voice.
- Low frequencies create heavier outward motion.
- A soft cyan/green wave travels around the sphere.
- Core brightness rises.
- Show:
  - Listening
  - recording duration
  - stop
  - cancel
- Do not create a weapon-targeting visual.

## Transcribing

- Voice-reactive motion settles.
- Particles become more ordered.
- A narrow scanning wave crosses the sphere.
- Show editable transcript.

## Thinking

- Particles flow inward.
- Several spiral bands form temporarily.
- Color moves toward deep electric blue.
- Core compresses and becomes brighter.
- Display a truthful operation:
  - Understanding request
  - Searching patient
  - Checking queue
  - Searching inventory
  - Preparing prescription draft

## Tool running

- A small group of particles leaves the core toward a data card.
- Show the real tool name.
- Wait for the real endpoint response.
- Do not show success early.

## Needs confirmation

- Motion slows.
- Add an amber outer halo.
- Keep the sphere stable.
- Bring the confirmation card forward.
- Clinical and patient-binding confirmation must require a click or keyboard action.
- Voice alone must not approve protected actions.

## Speaking

- Palette transitions toward violet-blue with cyan highlights.
- Particle waves move outward.
- Radius and speed respond to real ElevenLabs output audio.
- Show text transcript at the same time.
- Keep movement smooth and heavy, not jumpy.

Suggested colors:

```text
violet: #8c5cff
blue:   #4d7dff
cyan:   #2de6e0
```

## Success

- One strong but short outward pulse.
- Particles settle to idle.
- Show the completed action truthfully.

## Warning

- Amber edge energy.
- No flashing.
- Explain the warning clearly.

## Error

- Brief loss of cohesion in the outer particles.
- Restrained red/amber edge.
- Keep the core visible.
- Offer retry and manual fallback.

## Disconnected

- Desaturated particles.
- Minimal motion.
- Show reconnect.
- Existing clinic workflow must remain usable.

---

# 10. Full-screen visual layout

Route:

```text
/app/jarvis
```

Recommended composition:

```text
┌──────────────────────────────────────────────────────────────┐
│ Back  JARVIS CLINICAL INTELLIGENCE      secure / doctor only │
│                                                              │
│               large volumetric particle core                 │
│                                                              │
│                    Listening / Thinking                      │
│                   concise transcript line                    │
│                                                              │
│       context cards appear only when needed                  │
│                                                              │
│  keyboard input        push to talk        end session       │
└──────────────────────────────────────────────────────────────┘
```

Keep the screen sparse.

Do not reproduce the crowded prototype navigation inside the Jarvis page.

The clinic sidebar can remain, but provide a distraction-free expanded mode.

---

# 11. Compact dock layout

Closed:

```text
small particle core
```

Open:

```text
┌──────────────────────────────────┐
│ Jarvis                 minimize  │
│                                  │
│       medium particle core       │
│                                  │
│ Listening / Thinking / Speaking  │
│ latest transcript                │
│ result card                      │
│                                  │
│ text input         push-to-talk  │
└──────────────────────────────────┘
```

Fix the current problems:

- Do not use an oversized panel.
- Do not place a large hexagon above the useful controls.
- Do not show multiple orbs.
- Do not let the panel cover half of the settings form unnecessarily.
- Do not render debug text such as `STATE: idle` in the production interface.
- Do not allow the close button to float outside the panel.
- Do not let the launcher remain visible as a duplicate orb while the panel is open.

---

# 12. ElevenLabs integration architecture

The existing Jarvis agent remains the intelligence and tool orchestrator.

Use ElevenLabs as the voice layer.

Preferred flow:

```text
Doctor microphone
→ speech transcription
→ existing Jarvis agent
→ OpenAI or Gemini reasoning/tool calls
→ final safe text response
→ backend ElevenLabs streaming TTS
→ browser audio playback
→ playback analyser
→ speaking particles
```

Do not replace the existing Jarvis backend tools with a second unrelated agent unless the project explicitly requires that architecture.

## Environment variables

Backend or `jarvis-agent` only:

```env
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_OUTPUT_FORMAT=
ELEVENLABS_REQUEST_TIMEOUT_MS=
ELEVENLABS_ENABLED=false
```

Optional STT:

```env
ELEVENLABS_STT_MODEL=scribe_v2_realtime
```

Never put the API key in:

```text
VITE_*
frontend source
localStorage
sessionStorage
IndexedDB
browser requests
logs
URLs
Git
```

## TTS endpoint

Add or reuse a protected server endpoint resembling:

```http
POST /api/v1/jarvis/voice/speak
```

Request:

```json
{
  "sessionId": "...",
  "text": "There are four patients remaining.",
  "clientTurnId": "..."
}
```

Server responsibilities:

- authenticate doctor
- validate Jarvis session
- verify clinic and doctor binding
- limit text length
- reject raw HTML
- redact logs
- call ElevenLabs from the server
- stream audio to the client
- set correct content type
- abort upstream request if the client disconnects
- enforce timeout
- enforce rate limit
- avoid storing clinical audio by default

Do not let the model choose arbitrary voice IDs or models.

## Real-time agent option

If using ElevenLabs Agents directly, the server must create a short-lived signed URL or WebRTC conversation token. The browser must never receive the ElevenLabs API key.

However, prefer TTS-only integration when the existing Jarvis agent already owns reasoning and clinical tools.

---

# 13. ElevenLabs voice recommendation

Create an original voice.

Do not clone or imitate the voice of an actor or Marvel character.

Use ElevenLabs Voice Design with this description:

```text
An original male-presenting synthetic clinical intelligence voice with a deep,
low-pitched baritone and controlled resonance. Calm, precise, highly articulate,
and quietly authoritative. Neutral international English with a subtle
British-leaning polish, but not theatrical. Measured cadence, short deliberate
pauses, crisp consonants, clear pronunciation of medical terms, medicine names,
patient IDs, dates, and numbers. Warm enough to reassure a doctor, but never
cheerful, casual, breathy, gravelly, aggressive, or dramatic. The sound should
feel advanced and substantial, with a restrained technological presence rather
than a robotic filter. Do not imitate any real actor or fictional character.
```

Preview text:

```text
Good afternoon, Doctor. Patient RXF-1042 has been identified and is waiting at
queue number three. There are four patients remaining. Paracetamol five hundred
milligrams is available in inventory. Shall I prepare the prescription draft
for your review?
```

Starting settings to test by ear:

```text
stability: approximately 0.70–0.80
similarity boost: approximately 0.70–0.85
style: approximately 0.10–0.25
speaker boost: enabled when supported
speed: approximately 0.92–0.97
```

These are starting points, not fixed rules.

The desired tone is:

```text
deep
calm
heavy
precise
controlled
professional
low emotional variance
clear medical pronunciation
```

Avoid:

```text
movie-trailer voice
villain voice
extreme bass
raspy texture
whispering
fast sales voice
comedic robot
celebrity imitation
```

## Model choice

Default live interaction:

```text
eleven_flash_v2_5
```

Use because responsiveness matters.

Optional quality mode:

```text
eleven_multilingual_v2
```

Use when richer voice quality is more important than minimum latency.

Normalize patient IDs, phone-like numbers, dates, dosages, and abbreviations before TTS so they are spoken clearly.

Never speak a full patient phone number.

---

# 14. Speech recognition

Preferred first release:

- Push-to-talk.
- Live microphone visualization.
- Transcript shown before sending.
- Doctor can edit transcript.
- Stop and cancel controls.
- Maximum recording duration.
- Audio tracks released after stop.

Possible transcription choices:

1. Existing browser/backend transcription already in the project.
2. ElevenLabs Scribe Realtime through a server-issued temporary token.
3. Existing OpenAI/Google speech pipeline if already implemented.

Do not add three transcription providers simultaneously.

Use the existing provider when it works.

Medical words and medicine names must be treated as untrusted transcript text and require doctor review.

---

# 15. Jarvis functional workflow

Support the real existing tools.

Examples:

```text
Open patient RXF-1042.
Find Priya Mehta.
Who is queue number five?
How many patients are remaining?
Search paracetamol 500 mg in inventory.
Show low-stock medicines.
Show this patient’s recent prescriptions.
Add paracetamol 500 mg twice daily for five days after food.
```

For patient lookup:

1. Listen.
2. Show transcript.
3. Search real backend data.
4. Show exact, duplicate, or no-match result.
5. Require doctor confirmation.
6. Bind patient only after confirmation.

For prescriptions:

1. Listen or accept text.
2. Create structured draft.
3. Validate required fields.
4. Show inventory warnings.
5. Doctor applies draft for review.
6. Do not overwrite non-empty doctor fields with empty AI fields.
7. Reset clinician confirmation.
8. Doctor reviews and finalizes through the existing endpoint.
9. Jarvis never finalizes autonomously.
10. Jarvis never directly sends WhatsApp.

---

# 16. Visual cards

Cards must be restrained glass panels.

Patient match card:

- patient code
- name
- age
- gender
- masked phone suffix
- queue number
- confirm button

Queue card:

- remaining patients
- current patient
- next patient
- waiting count

Inventory card:

- medicine
- generic/brand
- strength
- dosage form
- quantity
- stock status

Prescription draft card:

- diagnosis proposal
- medicine rows
- missing fields
- duplicate warnings
- inventory warnings
- apply for review
- reject
- edit transcript

Communication card:

- queued
- sent
- delivered
- read
- failed

Do not use holographic decoration around every normal piece of text.

---

# 17. Performance requirements

Target:

- smooth 60 FPS on a typical modern desktop
- acceptable 30–60 FPS on integrated graphics
- adaptive quality on weak devices
- no typing lag in prescription forms
- no memory leak after repeated opening and closing
- no running microphone after stop
- no running animation when off
- no duplicate AudioContext
- no duplicate WebGL canvas
- no unbounded particle allocation

Quality tiers:

```ts
low: {
  particleCount: 6000,
  dprMax: 1,
  bloom: false,
  outerHalo: false
}

medium: {
  particleCount: 18000,
  dprMax: 1.5,
  bloom: true,
  outerHalo: true
}

high: {
  particleCount: 40000,
  dprMax: 2,
  bloom: true,
  outerHalo: true
}
```

Use actual performance monitoring to downgrade quality.

Pause or reduce rendering when:

- tab is hidden
- Jarvis panel is closed
- assistant is off
- device performance falls below threshold
- reduced motion is enabled

Do not allocate new vectors, colors, or arrays inside the frame loop.

---

# 18. Accessibility and reduced motion

Every visual state must also have visible text.

Requirements:

- keyboard access
- focus management
- labelled microphone button
- stop and cancel controls
- `aria-live="polite"` for meaningful state changes
- no announcement of amplitude values
- visible focus rings
- color is not the only state signal
- 200% zoom support
- high contrast text
- explicit confirmation controls
- Escape closes non-blocking overlays
- typed input always available

For `prefers-reduced-motion`:

- reduce particle count
- remove rapid turbulence
- remove continuous camera movement
- replace expansion with subtle opacity and scale changes
- keep state text and workflow fully functional

---

# 19. Security

- ElevenLabs key remains server-side.
- No provider key in Vite.
- Do not log patient queries, transcripts, clinical text, tokens, or audio.
- Enforce role=doctor for Jarvis clinical use.
- Validate clinic ownership through existing backend.
- Never trust clinic ID or doctor ID from the model or browser body.
- Use existing Jarvis session authentication.
- Rate-limit TTS.
- Enforce maximum text and audio size.
- Use abort signals and timeouts.
- Do not persist voice audio by default.
- Do not send full patient records to ElevenLabs.
- Send only the final sentence that must be spoken.
- Do not include diagnosis or medicine details in external voice calls unless product policy explicitly permits it and consent/privacy review has approved it.
- Provide a text-only mode.

---

# 20. Testing

## Component tests

Test:

- one orb only
- launcher hidden while dock is open
- correct state labels
- state-machine transitions
- microphone denied fallback
- microphone cleanup
- AudioContext cleanup
- playback analyser cleanup
- no duplicate renderer
- reduced motion
- safe draft merge
- doctor confirmation
- compact and full-screen reuse the same provider

## Audio tests

With deterministic synthetic audio:

- silence keeps idle motion low
- low tone produces heavier radial movement
- mid tone changes flow speed
- high tone changes shimmer
- attack responds quickly
- release settles smoothly
- speaking uses playback amplitude
- animations stop after playback

## End-to-end tests

Test:

1. Doctor sees Jarvis sidebar icon.
2. Admin and receptionist do not see clinical Jarvis access unless explicitly permitted.
3. Full-screen route opens.
4. Compact launcher opens one window.
5. Voice permission is requested only after user action.
6. Listening state reacts to microphone fixture.
7. Patient lookup returns real test data.
8. Duplicate names require selection.
9. Queue count comes from backend.
10. Inventory result comes from backend.
11. Prescription draft requires doctor review.
12. ElevenLabs failure falls back to text.
13. Manual workflow remains usable.
14. Closing Jarvis releases microphone and renderer.

## Visual regression

Capture:

- full-screen idle
- full-screen listening
- full-screen thinking
- full-screen speaking
- full-screen confirmation
- compact closed
- compact open
- patient matches
- inventory result
- prescription draft
- error
- disconnected
- mobile bottom sheet
- reduced motion
- light and dark application themes where applicable

Inspect diffs before accepting snapshots.

---

# 21. Acceptance criteria

The feature is complete only when:

- The static hexagon prototype is removed.
- The duplicate orbs are removed.
- One realistic GPU particle sphere is used.
- The sphere visibly reacts to real microphone amplitude.
- The sphere visibly reacts to real output audio.
- Full-screen and compact modes both work.
- The sidebar includes Jarvis for authorized doctors.
- The dashboard includes the compact launcher.
- ElevenLabs API key is not present in frontend output.
- TTS streams from a protected server route.
- The voice is original and does not imitate an actor.
- Patient lookup, queue, inventory, and prescription workflows still use real backend data.
- Doctor confirmation remains mandatory.
- Jarvis failure never blocks the manual workflow.
- Typecheck, build, tests, accessibility, and visual regression pass.
- The final report states actual results without pretending unimplemented capabilities exist.

---

# 22. Final delivery report

Return:

1. Project audit.
2. Files created.
3. Files changed.
4. Packages added and verified versions.
5. Full-screen route.
6. Compact launcher integration.
7. Particle shader explanation.
8. Audio-analysis explanation.
9. ElevenLabs endpoint implementation.
10. Voice configuration used.
11. Security controls.
12. Performance measurements.
13. Accessibility behavior.
14. Test commands and exact results.
15. Screenshots for all important states.
16. Remaining limitations.
17. Rollback instructions.

Do not claim the visual is audio-reactive unless microphone and output audio values actually drive the shader.

Do not claim audio is delivered in real time unless the streaming endpoint was actually tested.
