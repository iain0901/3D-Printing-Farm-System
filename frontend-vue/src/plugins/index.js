/* 公共引入,勿随意修改,修改时需经过确认 */
import '@/styles/vab.scss'
import '@/config/permission'
import VabPermissions from 'layouts/Permissions'
import { registerLayoutComponents } from '@/layouts/export'
import { setupErrorLog } from '@/utils/errorLog'
import Vab from '@/utils/vab'
import setupElement from './element'
import './support'
import setupVabIcon from './vabIcon'

const setupPlugins = (app) => {
  app.use(Vab)
  app.use(VabPermissions)
  registerLayoutComponents(app)
  setupErrorLog(app)
  setupElement(app)
  setupVabIcon(app)
}

export default setupPlugins
