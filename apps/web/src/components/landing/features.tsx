"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { Play, RefreshCw, Link2, BarChart3, Globe } from "lucide-react"
import Image from "next/image"

const features = [
  {
    icon: Globe,
    title: "One Link. Every Platform.",
    description: "Go live on TikTok, YouTube, and Twitch at the same time. Drop one shoppable link that works everywhere — we track which platform drove each sale.",
    image: "/feature-multiplatform.jpg",
    badges: ["Works with Restream, StreamYard, OBS", "Unified analytics across platforms"],
    featured: true,
  },
  {
    icon: Play,
    title: "Pin Products During Live",
    description: "Drop shoppable links the moment you mention a product. Viewers tap, checkout opens — no leaving your stream.",
    image: "/feature-live-commerce.jpg",
  },
  {
    icon: RefreshCw,
    title: "Replays That Keep Selling",
    description: "Auto-generate shoppable replay pages with timestamped moments. Every product mention becomes a buy button.",
    image: "/feature-replay.jpg",
  },
  {
    icon: Link2,
    title: "Your Bio, Your Store",
    description: "A beautiful storefront that lives in your bio. Feature products, limited drops, and exclusive offers.",
    image: "/feature-bio-store.jpg",
  },
  {
    icon: BarChart3,
    title: "Know What Actually Works",
    description: "See exactly which live moment, replay timestamp, or link drove each sale. Finally, real ROI on your content.",
    image: "/feature-analytics.jpg",
  },
]

export default function Features() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <section id="features" className="relative overflow-hidden py-24">
      <div className="container mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-accent/20 text-foreground border border-accent/30 mb-6">
            Features
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            One Platform. Every Surface.
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Sell where your audience is — live streams, replays, or your bio link.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className={`group relative bg-card rounded-2xl border border-border p-6 hover:border-accent/30 transition-all duration-300 hover:shadow-lg overflow-hidden ${
                feature.featured ? "md:col-span-2" : ""
              }`}
            >
              <div className={`${feature.featured ? "md:flex md:gap-8 md:items-start" : ""}`}>
                <div className={`${feature.featured ? "md:flex-1" : ""}`}>
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                      <feature.icon className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-foreground mb-2">{feature.title}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                  
                  {/* Badges for featured items */}
                  {feature.badges && (
                    <div className="flex flex-wrap gap-2 mb-4 md:mb-0 ml-14">
                      {feature.badges.map((badge) => (
                        <span
                          key={badge}
                          className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-full bg-accent/10 text-accent border border-accent/20"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Feature Image */}
                <div className={`relative w-full rounded-xl overflow-hidden bg-gradient-to-br from-accent/10 to-accent/5 ${
                  feature.featured ? "h-56 md:h-64 md:w-1/2 md:flex-shrink-0" : "h-48 mt-4"
                }`}>
                  <Image
                    src={feature.image || "/placeholder.svg"}
                    alt={feature.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
