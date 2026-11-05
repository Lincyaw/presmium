// Loaded after the core has installed window.gsap: plugins register themselves during module evaluation.
// One module keeps this preparation to one request instead of a request for each plugin.
export { SplitText } from 'gsap/SplitText'
export { TextPlugin } from 'gsap/TextPlugin'
export { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
export { MorphSVGPlugin } from 'gsap/MorphSVGPlugin'
export { MotionPathPlugin } from 'gsap/MotionPathPlugin'
export { CustomEase } from 'gsap/CustomEase'
export { CustomBounce } from 'gsap/CustomBounce'
export { CustomWiggle } from 'gsap/CustomWiggle'
export { Physics2DPlugin } from 'gsap/Physics2DPlugin'
export { PhysicsPropsPlugin } from 'gsap/PhysicsPropsPlugin'
export { Flip } from 'gsap/Flip'
