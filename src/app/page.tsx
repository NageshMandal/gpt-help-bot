'use client'

import React, { useEffect, useRef, useState } from 'react'
import './page.css'

// ✅ Fix: define missing type for TS
type SpeechRecognitionEvent = Event & {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

export default function Home() {
  const [isListening, setIsListening] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [codeText, setCodeText] = useState('')

  const recognitionRef = useRef<any>(null)
  const forceStopRef = useRef(false)
  const listeningRef = useRef(isListening)
  const streamingRef = useRef(isStreaming)

  useEffect(() => {
    listeningRef.current = isListening
    streamingRef.current = isStreaming
  }, [isListening, isStreaming])

  useEffect(() => {
    const SpeechRecognition =
      (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ''
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript + ' '
          } else {
            interim += event.results[i][0].transcript + ' '
          }
        }
        setLiveTranscript(interim.trim())
        setFinalTranscript(prev => (final ? prev + final : prev))
      }

      recognition.onend = () => {
        if (listeningRef.current && !streamingRef.current && !forceStopRef.current) {
          recognition.start()
        }
      }

      recognitionRef.current = recognition
    }

    const handleMediaKey = (e: KeyboardEvent) => {
      if (e.key === 'MediaPlayPause' || e.key === 'Enter') {
        if (!streamingRef.current) {
          if (!listeningRef.current) {
            startListening()
          } else {
            stopAndSubmit()
          }
        }
      }
    }

    window.addEventListener('keydown', handleMediaKey)
    return () => window.removeEventListener('keydown', handleMediaKey)
  }, [])

  const toggleMic = () => {
    if (isStreaming) return
    if (!isListening) {
      startListening()
    } else {
      stopAndSubmit()
    }
  }

  const startListening = () => {
    if (recognitionRef.current && !isStreaming) {
      resetAll()
      forceStopRef.current = false
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  const stopAndSubmit = () => {
    forceStopRef.current = true
    if (recognitionRef.current) recognitionRef.current.stop()
    setIsListening(false)

    setTimeout(() => {
      if (finalTranscript.trim()) {
        setIsStreaming(true)
        streamGPTResponse(finalTranscript.trim())
      } else {
        console.warn('Transcript is empty. Nothing to submit.')
      }
    }, 300)
  }

  const streamGPTResponse = async (input: string) => {
    setAnswerText('')
    setCodeText('')

    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: input }),
    })

    const reader = res.body?.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let currentAnswer = ''
    let currentCode = ''

    while (true) {
      const { value, done } = await reader!.read()
      if (done) break
      const chunk = decoder.decode(value)
      fullText += chunk

      const [ans, code] = splitAnswerAndCode(fullText)

      if (ans !== currentAnswer) {
        currentAnswer = ans
        setAnswerText(ans)
      }

      if (code !== currentCode) {
        currentCode = code
        setCodeText(code)
      }
    }

    setIsStreaming(false)
    setIsListening(false)
    forceStopRef.current = true
    setLiveTranscript('')
    setFinalTranscript('')
  }

  const splitAnswerAndCode = (text: string): [string, string] => {
    const match = text.match(/^(.*?)(```[\s\S]*?```)/s)
    if (match) {
      return [match[1].trim(), match[2].replace(/```[a-z]*\n?|```/g, '').trim()]
    }
    return [text.trim(), '']
  }

  const resetAll = () => {
    setAnswerText('')
    setCodeText('')
    setFinalTranscript('')
    setLiveTranscript('')
  }

  return (
    <div className="container">
      <div className="box" id="ans">
        <p>{isStreaming && !answerText ? <span className="spinner" /> : answerText || 'ans'}</p>
      </div>

      <div className="box" id="code">
        <pre>{isStreaming && !codeText ? <span className="spinner" /> : codeText || 'code'}</pre>
      </div>

      <div className="box" id="transcript">
        <strong>📝 Final Transcript:</strong>
        <p>{finalTranscript || '...'}</p>
      </div>

      <div className="button-row">
        <button onClick={toggleMic} disabled={isStreaming}>
          {isListening ? '🎤 Stop & Submit' : '🎧 Start Listening'}
        </button>
      </div>
    </div>
  )
}
