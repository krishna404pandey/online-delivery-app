const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Normalize role comparison (case-insensitive)
    const userRole = req.user.role ? req.user.role.toLowerCase().trim() : null;
    const allowedRoles = roles.map(role => role.toLowerCase().trim());
    
    if (!userRole) {
      console.error('Authorization failed: No role found in user object', { user: req.user });
      return res.status(403).json({ error: 'User role not found' });
    }
    
    if (!allowedRoles.includes(userRole)) {
      console.error('Authorization failed:', {
        userRole: userRole,
        allowedRoles: allowedRoles,
        userId: req.user.userId,
        email: req.user.email
      });
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        details: `Required role: ${roles.join(' or ')}, Your role: ${req.user.role}`
      });
    }
    
    next();
  };
};

module.exports = { authenticateToken, authorizeRole };

