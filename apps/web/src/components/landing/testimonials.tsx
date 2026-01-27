"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { Marquee } from "@/components/magicui/marquee"
import { cn } from "@/lib/utils"

const testimonials = [
  {
    name: "Sarah Chen",
    handle: "@sarahcreates",
    platform: "TikTok",
    body: "I used to lose half my viewers to 'link in bio'. Now they checkout without leaving my stream.",
    gradient: "from-pink-400 to-rose-500",
  },
  {
    name: "Marcus Johnson",
    handle: "@marcusj",
    platform: "YouTube",
    body: "My replays made $2,400 last month. They used to make nothing.",
    gradient: "from-red-400 to-orange-500",
  },
  {
    name: "Priya Sharma",
    handle: "@priyashops",
    platform: "Instagram",
    body: "Finally I know which content actually drives sales, not just views.",
    gradient: "from-purple-400 to-indigo-500",
  },
  {
    name: "Alex Rivera",
    handle: "@alexstyle",
    platform: "TikTok",
    body: "The checkout flow is so seamless. My conversion rate went up 3x since switching to Unifyed.",
    gradient: "from-cyan-400 to-blue-500",
  },
  {
    name: "Emma Watson",
    handle: "@emmacooks",
    platform: "YouTube",
    body: "Being able to see exactly which video drove each sale changed how I plan my content.",
    gradient: "from-amber-400 to-orange-500",
  },
  {
    name: "Jordan Lee",
    handle: "@jordanfits",
    platform: "Instagram",
    body: "Setup took 5 minutes. Made my first sale during my next stream. This is the future.",
    gradient: "from-emerald-400 to-teal-500",
  },
]

const firstRow = testimonials.slice(0, testimonials.length / 2)
const secondRow = testimonials.slice(testimonials.length / 2)

const ReviewCard = ({
  name,
  handle,
  platform,
  body,
  gradient,
}: {
  name: string
  handle: string
  platform: string
  body: string
  gradient: string
}) => {
  return (
    <figure
      className={cn(
        "relative w-80 cursor-pointer overflow-hidden rounded-2xl border p-6",
        "border-border bg-card hover:border-accent/30",
        "transition-all duration-300 hover:shadow-lg"
      )}
    >
      <blockquote className="text-foreground leading-relaxed mb-6">"{body}"</blockquote>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-sm shrink-0`}>
          {name.charAt(0)}
        </div>
        <div className="flex flex-col">
          <figcaption className="font-medium text-foreground">{name}</figcaption>
          <p className="text-sm text-muted-foreground">{handle} · {platform}</p>
        </div>
      </div>
    </figure>
  )
}

export function TestimonialsSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <section id="testimonials" className="relative overflow-hidden py-24">
      <div className="container mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-accent/20 text-foreground border border-accent/30 mb-6">
            Testimonials
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            Built for Creators Who Move Product
          </h2>
        </motion.div>

        {/* Animated Testimonial Cards */}
        <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
          <Marquee pauseOnHover className="[--duration:30s]">
            {firstRow.map((review) => (
              <ReviewCard key={review.handle} {...review} />
            ))}
          </Marquee>
          <Marquee reverse pauseOnHover className="[--duration:30s]">
            {secondRow.map((review) => (
              <ReviewCard key={review.handle} {...review} />
            ))}
          </Marquee>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-background"></div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-background"></div>
        </div>
      </div>
    </section>
  )
}
