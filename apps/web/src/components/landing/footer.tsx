"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { ArrowRight } from "lucide-react"

const footerLinks = {
  product: ["Features", "Pricing", "FAQ"],
  resources: ["Blog", "Contact"],
  social: [
    { name: "Twitter/X", href: "#" },
    { name: "TikTok", href: "#" },
    { name: "Instagram", href: "#" },
  ],
}

export function Footer() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <footer className="relative overflow-hidden">
      {/* CTA Banner */}
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.6 }}
        className="bg-primary py-16"
      >
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-6 text-balance">
            Ready to turn views into revenue?
          </h2>
          <button className="group inline-flex items-center gap-2 px-8 py-4 bg-primary-foreground text-primary font-semibold rounded-full hover:opacity-90 transition-all">
            Join the Waitlist
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </motion.div>

      {/* Footer Content */}
      <div className="bg-card border-t border-border py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8">
            {/* Logo */}
            <div className="flex-shrink-0">
              <a href="/" className="text-2xl font-bold text-foreground">
                Unifyed
              </a>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                The commerce OS for creators who sell during live streams, replays, and social content.
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-wrap gap-12">
              <div>
                <h4 className="font-semibold text-foreground mb-4">Product</h4>
                <ul className="space-y-2">
                  {footerLinks.product.map((link) => (
                    <li key={link}>
                      <a href={`#${link.toLowerCase()}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-4">Resources</h4>
                <ul className="space-y-2">
                  {footerLinks.resources.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
                        {link}
                        {link === "Blog" && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded">Soon</span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-4">Social</h4>
                <ul className="space-y-2">
                  {footerLinks.social.map((link) => (
                    <li key={link.name}>
                      <a href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        {link.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground text-center">
              © 2026 Unifyed. Built for creators, by creators.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
