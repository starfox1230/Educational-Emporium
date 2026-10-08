# Sound Garden · CKLA Spelling Practice

A phone-first spelling practice app for CKLA Grade 1 Skills. Children hear a word or sentence with the device's built-in English speech voice, replay it as needed, and spell with a touch-friendly on-screen keyboard. Practice progress and grown-up word lists stay in the browser's local storage on that device.

## Practice paths

- **Word garden:** original cold-word examples arranged by unit skill progression.
- **Tricky word trail:** cumulative tricky words through the selected unit.
- **Sentence meadow:** original sentences that use the growing spelling code.
- **My spelling list:** a parent's own exact weekly words, kept separate by unit.

The included cold words and sentences are original examples, not a reproduction of CKLA assessment or teacher-guide lists. CKLA editions and classroom weekly lists can differ. A grown-up can enter the assigned list for a unit in **Grown-ups**. Unit progression and tricky-word scope are based on the CKLA Grade 1 context shared with this project.

Built-in words and sentences use prerecorded AI-generated speech from OpenAI's GPT-Realtime-2.1 Mini model with the Marin voice. Custom grown-up lists use the device's browser speech voice. Audio clips load as needed and are cached by the service worker after they are played.

## Run it

Open `index.html` in a browser. To install it on an iPhone, open the hosted page in Safari and choose **Share → Add to Home Screen**. The service worker caches the app shell for offline launch; built-in audio is cached as each clip is played.

## References

- [Core Knowledge Foundation — CKLA free curriculum](https://www.coreknowledge.org/download-free-curriculum/)
- [Core Knowledge Foundation — CKLA Grade 1 Unit 1](https://www.coreknowledge.org/free-resource/ckla-unit-1-grade-1-skills/)
- [Core Knowledge Foundation — CKLA Grade 1 Unit 7](https://www.coreknowledge.org/free-resource/ckla-unit-7-grade-1-skills-kay-martez/)
