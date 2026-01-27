"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import Image from "next/image"

const integrationCategories = [
  {
    title: "Streaming Platforms",
    items: [
      { name: "TikTok", logo: "/logos/tiktok.png", hasBg: true },
      { name: "YouTube", logo: "/logos/youtube.png", hasBg: false },
      { name: "Twitch", logo: "/logos/twitch.png", hasBg: true },
      { name: "Instagram", logo: null, initial: "IG", soon: true },
    ],
  },
  {
    title: "Multi-Stream Tools",
    items: [
      { name: "Restream", logo: null, initial: "R" },
      { name: "StreamYard", logo: null, initial: "SY" },
      { name: "OBS", logo: null, initial: "OBS" },
    ],
  },
  {
    title: "Commerce",
    items: [
      { name: "Shopify", logo: null, initial: "S" },
      { name: "Stripe", logo: null, initial: "$", soon: true },
    ],
  },
]

export function IntegrationsSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <section id="integrations" className="relative py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            Stream Anywhere. Sell Everywhere.
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Works with your favorite streaming tools and platforms
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto space-y-12">
          {integrationCategories.map((category, categoryIndex) => (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.5, delay: categoryIndex * 0.1 }}
            >
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-6 text-center">
                {category.title}
              </h3>
              <div className="flex flex-wrap items-center justify-center gap-4">
                {category.items.map((item) => (
                  <div
                    key={item.name}
                    className="relative flex items-center gap-3 px-5 py-3 bg-card rounded-xl border border-border hover:border-accent/30 transition-all duration-300 hover:shadow-md"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      item.logo && item.hasBg ? "bg-black" : "bg-foreground/5"
                    }`}>
                      {item.logo ? (
                        <Image
                          src={item.logo || "/placeholder.svg"}
                          alt={item.name}
                          width={24}
                          height={24}
                          className="w-5 h-5"
                        />
                      ) : (
                        <span className="text-xs font-bold text-foreground/60">{item.initial}</span>
                      )}
                    </div>
                    <span className="font-medium text-foreground">{item.name}</span>
                    {item.soon && (
                      <span className="absolute -top-2 -right-2 px-2 py-0.5 text-[10px] font-medium bg-accent text-accent-foreground rounded-full">
                        Soon
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
