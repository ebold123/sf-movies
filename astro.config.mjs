// @ts-check
import { defineConfig } from 'astro/config';

// Vercel sets process.env.VERCEL during build; GitHub Pages serves this
// site from a /sf-movies/ subpath, Vercel serves it from the domain root.
const isVercel = !!process.env.VERCEL;

// https://astro.build/config
export default defineConfig({
  site: isVercel ? 'https://sf-movies-lime.vercel.app' : 'https://nitidbit.github.io',
  base: isVercel ? '/' : '/sf-movies/',
});
