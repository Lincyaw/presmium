# The environment the papers pipeline runs in: the Edge speech engine (tools/edge-speech.py) and FFmpeg.
#   . tools/env.sh
# Set PRESMIUM_FFMPEG yourself when ffmpeg is not on the path.
export PRESMIUM_SPEECH_EDGE_URL=http://127.0.0.1:47231/v1
export PRESMIUM_SPEECH_EDGE_PROVIDER='Microsoft Edge'
export PRESMIUM_SPEECH_EDGE_MODEL=edge-tts
export PRESMIUM_SPEECH_EDGE_TRANSCRIBE_MODEL=none
