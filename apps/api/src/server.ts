import dotenv from 'dotenv'
import path from 'path'
import { createApp } from './app'
import { loadTestData } from './load-test-data'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const PORT = Number(process.env.SERVER_PORT) || 3000

const app = createApp()

loadTestData()

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})
