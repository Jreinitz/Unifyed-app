"use client"

import { useState, useRef } from "react"
import { Plus, Minus } from "lucide-react"
import { motion, AnimatePresence, useInView } from "framer-motion"

const faqs = [
  {
    question: "Do I need a Shopify store?",
    answer: "Yes, for now. We're launching with Shopify first, with more platforms coming soon.",
  },
  {
    question: "Does this work with TikTok Shop?",
    answer: "Unifyed works alongside TikTok Shop. We handle checkout for products not in TikTok Shop, or for when you want better margins and attribution.",
  },
  {
    question: "How is this different from Linktree?",
    answer: "Linktree links out. Unifyed checks out. One-click purchase without leaving, plus real attribution showing which content drives sales.",
  },
  {
    question: "When does this launch?",
    answer: "We're launching in Q1 2026. Join the waitlist for early access and founding member pricing.",
  },
]

export function FAQSection() {
  const [openItems, setOpenItems] = useState<number[]>([])
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })

  const toggleItem = (index: number) => {
    setOpenItems((prev) => 
      prev.includes(index) 
        ? prev.filter((i) => i !== index) 
        : [...prev, index]
    )
  }

  return (
    <section id="faq" className="relative overflow-hidden py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-accent/20 text-foreground border border-accent/30 mb-6">
            FAQ
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            Questions? We've Got Answers
          </h2>
        </motion.div>

        <div className="max-w-2xl mx-auto space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={faq.question}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-card rounded-xl border border-border overflow-hidden"
            >
              <button
                onClick={() => toggleItem(index)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-secondary/50 transition-colors"
              >
                <h3 className="font-medium text-foreground pr-4">{faq.question}</h3>
                <motion.div
                  animate={{ rotate: openItems.includes(index) ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {openItems.includes(index) ? (
                    <Minus className="w-5 h-5 text-accent flex-shrink-0" />
                  ) : (
                    <Plus className="w-5 h-5 text-accent flex-shrink-0" />
                  )}
                </motion.div>
              </button>
              <AnimatePresence>
                {openItems.includes(index) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6 text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
