/** @type {import('tailwindcss').Config} */
export default {
  content: ['./views/**/*.ejs'],
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['dark'],
  },
};
