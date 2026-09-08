import { appName } from '../../Utils.js';

// `GetLogoByDomain` is used to get logo by domain as well as check whether the
// initial admin account has been created.
export default async function GetLogoByDomain(request) {
  const domain = request.params.domain;
  try {
    const tenantQuery = new Parse.Query('partners_Tenant');
    tenantQuery.equalTo('Domain', domain);
    const res = await tenantQuery.first({ useMasterKey: true });
    let tenantRes = res;
    if (!tenantRes) {
      const anyTenantQuery = new Parse.Query('partners_Tenant');
      tenantRes = await anyTenantQuery.first({ useMasterKey: true });
    }
    if (tenantRes) {
      // Only report the admin as "exist" once an admin user has actually been
      // created. A tenant record left behind by an interrupted first-run setup
      // must not block the /addadmin page.
      const adminQuery = new Parse.Query('contracts_Users');
      adminQuery.equalTo('UserRole', 'contracts_Admin');
      adminQuery.notEqualTo('IsDisabled', true);
      const adminRes = await adminQuery.first({ useMasterKey: true });
      return {
        logo: res?.Logo || '',
        favicon: res?.Favicon || res?.Logo || '',
        appname: appName,
        user: adminRes ? 'exist' : 'not_exist',
      };
    }
    return { logo: '', appname: appName, user: 'not_exist' };
  } catch (err) {
    const code = err.code || 400;
    const msg = err.message || 'Something went wrong.';
    throw new Parse.Error(code, msg);
  }
}
