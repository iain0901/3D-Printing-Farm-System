import permissions from './permissions'

const install = function (app) {
  app.directive('permissions', permissions)
}

permissions.install = install
export default permissions
