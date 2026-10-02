import russian from './ru.js'

// New personal screens ship Russian and English. Other original languages keep
// their existing translations and use an explicit English fallback for these keys.
export default Object.fromEntries(Object.keys(russian).map(key => [key, key]))
