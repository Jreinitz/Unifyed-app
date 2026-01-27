"use client"

import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { ArrowRight, Play } from "lucide-react"
import Image from "next/image"

export default function Hero() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <section className="relative overflow-hidden min-h-screen flex flex-col">
      <div className="container mx-auto px-4 py-24 sm:py-32 relative z-10 flex-1 flex flex-col">
        <div className="mx-auto max-w-5xl text-center flex-1 flex flex-col justify-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-accent/20 text-foreground border border-accent/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </span>
              Launching Q1 2026
            </span>
          </motion.div>

          {/* Main Heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6"
          >
            <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl text-balance">
              One Stream. Every Platform.
              <br />
              <span className="text-accent">Unified Commerce.</span>
            </h1>
          </motion.div>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground leading-relaxed"
          >
            Go live on TikTok, YouTube, and Twitch simultaneously — and sell to every viewer with one shoppable link. Real attribution, real checkout, real revenue.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <button className="group inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground font-semibold rounded-full hover:opacity-90 transition-all shadow-lg">
              Join the Waitlist
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="inline-flex items-center gap-2 px-8 py-4 bg-transparent text-foreground font-medium rounded-full border border-border hover:bg-secondary transition-all">
              <Play className="w-4 h-4" />
              See How It Works
            </button>
          </motion.div>

          {/* Hero Visual - Clean SVG Illustration */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="relative mx-auto w-full max-w-5xl"
          >
            <div className="relative">
              {/* Main SVG Illustration */}
              <div className="relative w-full aspect-[1728/1117] rounded-2xl overflow-hidden">
                <Image
                  src="/hero-illustration.svg"
                  alt="Multi-platform streaming flow: TikTok, YouTube, and Twitch connecting to unified commerce checkout"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              
              {/* Floating Sale Notifications - positioned around the Unifyed logo in center */}
              {/* Twitch - top of center logo */}
              <motion.div 
                className="absolute top-[20%] left-1/2 -translate-x-1/2 bg-[#9146ff] text-white text-[10px] md:text-xs font-medium px-3 py-1.5 md:px-4 md:py-2 rounded-full shadow-xl flex items-center gap-1.5"
                initial={{ opacity: 0, y: -20, scale: 0.8 }}
                animate={{ 
                  opacity: 1, 
                  y: [0, -6, 0], 
                  scale: 1 
                }}
                transition={{ 
                  opacity: { delay: 1.6, duration: 0.4 },
                  y: { delay: 2, duration: 3, repeat: Infinity, ease: "easeInOut" },
                  scale: { delay: 1.6, duration: 0.4 }
                }}
              >
                <svg className="w-3 h-3 md:w-4 md:h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
                </svg>
                +$28 from Twitch
              </motion.div>
              
              {/* TikTok - left of center logo */}
              <motion.div 
                className="absolute top-[32%] left-[28%] bg-[#ff0050] text-white text-[10px] md:text-xs font-medium px-3 py-1.5 md:px-4 md:py-2 rounded-full shadow-xl flex items-center gap-1.5"
                initial={{ opacity: 0, x: -20, scale: 0.8 }}
                animate={{ 
                  opacity: 1, 
                  y: [0, -5, 0], 
                  x: 0,
                  scale: 1 
                }}
                transition={{ 
                  opacity: { delay: 1, duration: 0.4 },
                  y: { delay: 2.3, duration: 3.5, repeat: Infinity, ease: "easeInOut" },
                  x: { delay: 1, duration: 0.4 },
                  scale: { delay: 1, duration: 0.4 }
                }}
              >
                <svg className="w-3 h-3 md:w-4 md:h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
                </svg>
                +$32 from TikTok
              </motion.div>
              
              {/* YouTube - bottom of center logo */}
              <motion.div 
                className="absolute top-[72%] left-1/2 -translate-x-1/2 bg-[#ff0000] text-white text-[10px] md:text-xs font-medium px-3 py-1.5 md:px-4 md:py-2 rounded-full shadow-xl flex items-center gap-1.5"
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ 
                  opacity: 1, 
                  y: [0, -4, 0], 
                  scale: 1 
                }}
                transition={{ 
                  opacity: { delay: 1.3, duration: 0.4 },
                  y: { delay: 2.6, duration: 4, repeat: Infinity, ease: "easeInOut" },
                  scale: { delay: 1.3, duration: 0.4 }
                }}
              >
                <svg className="w-3 h-3 md:w-4 md:h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                +$47 from YouTube
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 pb-8"
        >
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-secondary/50 rounded-full border border-border">
              <span className="text-sm text-muted-foreground">
                Creators multi-stream to <span className="font-semibold text-foreground">3+ platforms</span> but lose sales juggling separate links
              </span>
              <span className="text-accent font-medium text-sm">— we unify it all.</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
