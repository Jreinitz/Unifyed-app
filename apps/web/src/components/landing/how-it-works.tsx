"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { ShoppingBag, Globe, DollarSign } from "lucide-react"

const steps = [
  {
    icon: ShoppingBag,
    step: "01",
    title: "Connect Your Store",
    description: "Link your Shopify in 60 seconds. We sync your products automatically.",
  },
  {
    icon: Globe,
    step: "02",
    title: "Create Universal Links",
    description: "Build one shoppable link that works across TikTok, YouTube, Twitch, and your bio. Drop it anywhere — we handle attribution automatically.",
  },
  {
    icon: DollarSign,
    step: "03",
    title: "Share & Get Paid",
    description: "Drop links during content. We handle checkout, inventory, and attribution.",
  },
]

export function HowItWorksSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <section id="how-it-works" className="relative overflow-hidden py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-accent/20 text-foreground border border-accent/30 mb-6">
            How It Works
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            Live in 3 Steps
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className="relative text-center"
            >
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-gradient-to-r from-border to-transparent"></div>
              )}
              
              <div className="relative inline-flex items-center justify-center w-24 h-24 mb-6">
                <div className="absolute inset-0 rounded-2xl bg-accent/10 border border-accent/20"></div>
                <step.icon className="w-10 h-10 text-accent" />
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                  {step.step}
                </div>
              </div>
              
              <h3 className="text-xl font-semibold text-foreground mb-3">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
