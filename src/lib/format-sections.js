// The Format subsections on the About page, in page order: the id each
// heading carries and its title. Each one has a shareable address at
// /format/<id> (so /format/long, /format/standard), which lands on /about#<id>.
export const FORMAT_SECTIONS = [
  ['qualifying', 'Open Qualifying'],
  ['standard', 'Standard'],
  ['long', 'Long'],
  ['feature-points', 'Feature Points'],
  ['the-math', 'The Math'],
];
export const formatSectionLink = (id) => `/format/${id}`;
