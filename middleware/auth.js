const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'livemart-secret-key-change-in-production', (err, user) => {
    if (err) {
      console.error('Token verification error:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    // Debug: Log decoded user info
    console.log('Token decoded successfully:', {
      userId: user.userId,
      email: user.email,
      role: user.role,
      roleType: typeof user.role,
      allKeys: Object.keys(user)
    });
    
    req.user = user;
    next();
  });
};

const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.error('Authorization failed: req.user is null/undefined');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Debug: Log full user object
    console.log('Authorization check:', {
      reqUser: req.user,
      reqUserRole: req.user.role,
      reqUserRoleType: typeof req.user.role,
      allowedRoles: roles,
      userId: req.user.userId,
      email: req.user.email
    });
    
    // Normalize role comparison (case-insensitive)
    const userRole = req.user.role ? String(req.user.role).toLowerCase().trim() : null;
    const allowedRoles = roles.map(role => String(role).toLowerCase().trim());
    
    if (!userRole || userRole === 'null' || userRole === 'undefined') {
      console.error('Authorization failed: No valid role found in user object', { 
        user: req.user,
        roleValue: req.user.role,
        roleType: typeof req.user.role
      });
      return res.status(403).json({ 
        error: 'User role not found',
        debug: {
          userRole: req.user.role,
          userObject: req.user
        }
      });
    }
    
    if (!allowedRoles.includes(userRole)) {
      console.error('Authorization failed - Role mismatch:', {
        userRole: userRole,
        userRoleOriginal: req.user.role,
        allowedRoles: allowedRoles,
        allowedRolesOriginal: roles,
        userId: req.user.userId,
        email: req.user.email,
        fullUserObject: JSON.stringify(req.user, null, 2)
      });
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        details: `Required role: ${roles.join(' or ')}, Your role: ${req.user.role || 'not found'}`,
        debug: {
          normalizedUserRole: userRole,
          normalizedAllowedRoles: allowedRoles,
          userObject: req.user
        }
      });
    }
    
    console.log('Authorization successful:', { userRole, allowedRoles });
    next();
  };
};

module.exports = { authenticateToken, authorizeRole };

