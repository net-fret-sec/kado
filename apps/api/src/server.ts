import { createApp } from './app'
import { loadTestData } from './load-test-data'

const PORT = Number(process.env.PORT || 3000)

const app = createApp()

loadTestData()

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})
