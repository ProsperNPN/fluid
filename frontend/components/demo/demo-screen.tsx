import { motion } from 'framer-motion';
import { Heart, Search, Bell, Settings, Home, BarChart3, MapPin, Phone, LogOut, Plus, CheckCircle, Clock, LogIn } from 'lucide-react';
import { FluidLogo } from '@/components/brand/fluid-logo';

export type ScreenType = 
  | 'splash'
  | 'login'
  | 'home'
  | 'requests'
  | 'search'
  | 'donor-profile'
  | 'hospital'
  | 'emergency'
  | 'match'
  | 'booking'
  | 'analytics'
  | 'notifications'
  | 'home-final';

interface DemoScreenProps {
  screenType: ScreenType;
  isVisible: boolean;
  progress?: number;
}

export function DemoScreen({ screenType, isVisible }: DemoScreenProps) {
  const screenVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  const countVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
  };

  switch (screenType) {
    case 'splash':
      return (
        <motion.div
          className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-red-500 to-red-600"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <motion.div
            className="text-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={isVisible ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
            transition={{ delay: 0.05, duration: 0.6, ease: 'easeOut' }}
          >
            <motion.div
              className="mx-auto mb-4 flex items-center justify-center"
              initial={{ opacity: 0, y: 6 }}
              animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <FluidLogo className="h-20 w-auto" />
            </motion.div>
            <h1 className="text-3xl font-bold text-white">FLUID</h1>
            <p className="mt-2 text-sm text-white/80">Blood Donation Platform</p>
          </motion.div>
        </motion.div>
      );

    case 'login':
      return (
        <motion.div
          className="flex h-full flex-col bg-gradient-to-b from-slate-50 to-white p-6"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <motion.div className="flex flex-1 flex-col items-center justify-center" variants={containerVariants}>
            <motion.div variants={itemVariants} className="mb-8 text-center">
              <div className="mx-auto mb-4 flex items-center justify-center">
                <FluidLogo className="h-14 w-auto" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Welcome to FLUID</h2>
            </motion.div>

            <motion.div variants={itemVariants} className="w-full space-y-3">
              <input
                type="email"
                placeholder="Email"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400"
              />
              <input
                type="password"
                placeholder="Password"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400"
              />
            </motion.div>

            <motion.button
              variants={itemVariants}
              className="mt-6 w-full rounded-lg bg-red-500 py-3 font-semibold text-white transition hover:bg-red-600"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Sign In
            </motion.button>
          </motion.div>
        </motion.div>
      );

    case 'home':
      return (
        <motion.div
          className="flex h-full flex-col bg-white"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FluidLogo className="h-7 w-auto" />
                <span className="text-sm font-bold tracking-[0.02em] text-slate-900">FLUID</span>
              </div>
              <span className="text-xs font-semibold text-slate-900">9:41</span>
            </div>
          </div>

          {/* Content */}
          <motion.div className="flex-1 overflow-y-auto px-4 py-4" variants={containerVariants}>
            <motion.div variants={itemVariants}>
              <h1 className="text-2xl font-bold text-slate-900">Hello, Alex</h1>
              <p className="mt-1 text-sm text-slate-600">Ready to help today?</p>
            </motion.div>

            <motion.div variants={itemVariants} className="mt-6 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 p-4 text-white">
              <p className="text-sm opacity-90">Blood Requests Nearby</p>
              <p className="mt-2 text-2xl font-bold">3 Available</p>
            </motion.div>

            <motion.div variants={itemVariants} className="mt-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <motion.div key={i} className="rounded-xl border border-slate-200 p-3" variants={itemVariants}>
                  <p className="text-sm font-semibold text-slate-900">O+ Blood Request</p>
                  <p className="mt-1 text-xs text-slate-600">City General Hospital • 2 km away</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* Tab bar */}
          <div className="border-t border-slate-100 flex justify-around px-4 py-3">
            <div className="flex flex-col items-center gap-1">
              <Home className="h-5 w-5 text-red-500" />
              <span className="text-xs text-red-500">Home</span>
            </div>
            <Search className="h-5 w-5 text-slate-400" />
            <Bell className="h-5 w-5 text-slate-400" />
            <Settings className="h-5 w-5 text-slate-400" />
          </div>
        </motion.div>
      );

    case 'requests':
      return (
        <motion.div
          className="flex h-full flex-col bg-white"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <div className="border-b border-slate-100 px-4 py-4">
            <h2 className="text-xl font-bold text-slate-900">Blood Requests</h2>
          </div>

          <motion.div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" variants={containerVariants}>
            {[1, 2, 3, 4, 5].map((i) => (
              <motion.div
                key={i}
                className="rounded-xl border border-slate-200 p-4"
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{i % 2 === 0 ? 'A+' : 'O+'} • {4 - i} Units</p>
                    <p className="mt-1 text-sm text-slate-600">Emergency • {5 * i} min ago</p>
                  </div>
                  <div className="rounded-full bg-red-100 px-3 py-1">
                    <span className="text-xs font-semibold text-red-600">Urgent</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      );

    case 'search':
      return (
        <motion.div
          className="flex h-full flex-col bg-white"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <div className="border-b border-slate-100 px-4 py-4">
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
              <Search className="h-4 w-4 text-slate-600" />
              <input
                type="text"
                placeholder="Search donors..."
                className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-600"
              />
            </div>
          </div>

          <motion.div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" variants={containerVariants}>
            {['Sarah', 'Mike', 'Emma', 'James'].map((name, i) => (
              <motion.div
                key={i}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3"
                variants={itemVariants}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-red-200" />
                  <div>
                    <p className="font-semibold text-slate-900">{name}</p>
                    <p className="text-xs text-slate-600">O+ • 2 km away</p>
                  </div>
                </div>
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      );

    case 'donor-profile':
      return (
        <motion.div
          className="flex h-full flex-col bg-white"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <motion.div className="border-b border-slate-100 px-4 py-4" variants={containerVariants}>
            <motion.div variants={itemVariants}>
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-red-300 to-red-400" />
              <h2 className="mt-3 text-2xl font-bold text-slate-900">Sarah Anderson</h2>
              <p className="mt-1 text-sm text-slate-600">O+ Blood Type • Verified Donor</p>
            </motion.div>
          </motion.div>

          <motion.div className="flex-1 px-4 py-4 space-y-4" variants={containerVariants}>
            <motion.div variants={itemVariants} className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-600">Donations Made</p>
              <p className="mt-2 text-3xl font-bold text-red-500">12</p>
            </motion.div>

            <motion.div variants={itemVariants} className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-600">Last Donation</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">45 days ago</p>
            </motion.div>

            <motion.button
              variants={itemVariants}
              className="w-full rounded-lg bg-red-500 py-3 font-semibold text-white transition hover:bg-red-600"
              whileHover={{ scale: 1.02 }}
            >
              Request Donation
            </motion.button>
          </motion.div>
        </motion.div>
      );

    case 'hospital':
      return (
        <motion.div
          className="flex h-full flex-col bg-white"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <div className="border-b border-slate-100 px-4 py-4">
            <h2 className="text-xl font-bold text-slate-900">Hospital Dashboard</h2>
          </div>

          <motion.div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" variants={containerVariants}>
            <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-red-50 p-4">
                <p className="text-xs text-slate-600">Active Requests</p>
                <motion.p
                  className="mt-2 text-2xl font-bold text-red-500"
                  initial={{ opacity: 0 }}
                  animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                >
                  12
                </motion.p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs text-slate-600">Matched Today</p>
                <motion.p
                  className="mt-2 text-2xl font-bold text-emerald-500"
                  initial={{ opacity: 0 }}
                  animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                >
                  8
                </motion.p>
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">Recent Matches</p>
              <div className="mt-3 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">O+ Blood • {i} unit</span>
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      );

    case 'emergency':
      return (
        <motion.div
          className="flex h-full flex-col bg-gradient-to-b from-red-500 to-red-600 p-4"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <motion.div className="flex flex-1 flex-col items-center justify-center text-center text-white" variants={containerVariants}>
            <motion.div
              variants={itemVariants}
              animate={isVisible ? { scale: [1, 1.1, 1] } : {}}
              transition={{ repeat: isVisible ? Infinity : 0, repeatType: 'reverse', duration: 1.5 }}
            >
              <Heart className="mx-auto h-16 w-16" fill="currentColor" />
            </motion.div>

            <motion.h2 variants={itemVariants} className="mt-4 text-2xl font-bold">
              EMERGENCY REQUEST
            </motion.h2>

            <motion.p variants={itemVariants} className="mt-2 text-sm opacity-90">
              A+ Blood Type • 6 Units
            </motion.p>

            <motion.p variants={itemVariants} className="mt-6 text-lg font-semibold">
              City General Hospital
            </motion.p>

            <motion.button
              variants={itemVariants}
              className="mt-8 rounded-lg bg-white px-8 py-3 font-semibold text-red-500 hover:bg-red-50"
              whileHover={{ scale: 1.05 }}
            >
              Accept Request
            </motion.button>
          </motion.div>
        </motion.div>
      );

    case 'match':
      return (
        <motion.div
          className="flex h-full flex-col bg-white"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <motion.div className="flex flex-1 flex-col items-center justify-center px-4 text-center" variants={containerVariants}>
            <motion.div variants={itemVariants} initial={{ scale: 0 }} animate={isVisible ? { scale: 1 } : { scale: 0 }} transition={{ delay: 0.1, type: 'spring' }}>
              <CheckCircle className="mx-auto h-16 w-16 text-emerald-500" />
            </motion.div>

            <motion.h2 variants={itemVariants} className="mt-4 text-2xl font-bold text-slate-900">
              Match Found!
            </motion.h2>

            <motion.p variants={itemVariants} className="mt-2 text-sm text-slate-600">
              Sarah Anderson has been matched for your request
            </motion.p>

            <motion.div variants={itemVariants} className="mt-6 w-full rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Donor Information</p>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p>Sarah Anderson • O+ Blood</p>
                <p>2 km away • Available Today</p>
              </div>
            </motion.div>

            <motion.button
              variants={itemVariants}
              className="mt-6 w-full rounded-lg bg-red-500 py-3 font-semibold text-white hover:bg-red-600"
              whileHover={{ scale: 1.02 }}
            >
              Proceed to Booking
            </motion.button>
          </motion.div>
        </motion.div>
      );

    case 'booking':
      return (
        <motion.div
          className="flex h-full flex-col bg-white"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <div className="border-b border-slate-100 px-4 py-4">
            <h2 className="text-xl font-bold text-slate-900">Book Appointment</h2>
          </div>

          <motion.div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" variants={containerVariants}>
            <motion.div variants={itemVariants} className="rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-900">Date</p>
              <p className="mt-2 text-sm text-slate-600">Today • 2:30 PM</p>
            </motion.div>

            <motion.div variants={itemVariants} className="rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-900">Location</p>
              <p className="mt-2 text-sm text-slate-600">City General Hospital • Unit 4</p>
            </motion.div>

            <motion.div variants={itemVariants} className="rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-900">Duration</p>
              <p className="mt-2 text-sm text-slate-600">~45 minutes</p>
            </motion.div>

            <motion.button
              variants={itemVariants}
              className="w-full rounded-lg bg-red-500 py-3 font-semibold text-white hover:bg-red-600"
              whileHover={{ scale: 1.02 }}
            >
              Confirm Appointment
            </motion.button>
          </motion.div>
        </motion.div>
      );

    case 'analytics':
      return (
        <motion.div
          className="flex h-full flex-col bg-white"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <div className="border-b border-slate-100 px-4 py-4">
            <h2 className="text-xl font-bold text-slate-900">Analytics</h2>
          </div>

          <motion.div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" variants={containerVariants}>
            <motion.div variants={itemVariants} className="rounded-xl bg-gradient-to-br from-red-50 to-red-100 p-4">
              <p className="text-xs text-slate-600">Donations This Month</p>
              <motion.p
                className="mt-2 text-3xl font-bold text-red-500"
                initial={{ opacity: 0 }}
                animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
              >
                42
              </motion.p>
            </motion.div>

            <motion.div variants={itemVariants} className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-600">Weekly Chart</p>
              <div className="mt-3 flex items-end gap-2 h-16">
                {[3, 5, 7, 4, 8, 6, 9].map((h, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 rounded-t bg-red-500"
                    initial={{ height: 0 }}
                    animate={isVisible ? { height: `${h * 8}%` } : { height: 0 }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      );

    case 'notifications':
      return (
        <motion.div
          className="flex h-full flex-col bg-white"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <div className="border-b border-slate-100 px-4 py-4">
            <h2 className="text-xl font-bold text-slate-900">Notifications</h2>
          </div>

          <motion.div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" variants={containerVariants}>
            {[
              { title: 'New Blood Request', time: '2 min ago', color: 'bg-red-50' },
              { title: 'Appointment Confirmed', time: '15 min ago', color: 'bg-emerald-50' },
              { title: 'Thank You Donation', time: '1 hour ago', color: 'bg-blue-50' }
            ].map((notif, i) => (
              <motion.div key={i} className={`${notif.color} rounded-xl p-4`} variants={itemVariants} initial={{ x: 50, opacity: 0 }} animate={isVisible ? { x: 0, opacity: 1 } : { x: 50, opacity: 0 }} transition={{ delay: 0.2 + i * 0.1, duration: 0.3 }}>
                <p className="font-semibold text-slate-900">{notif.title}</p>
                <p className="mt-1 text-xs text-slate-600">{notif.time}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      );

    case 'home-final':
      return (
        <motion.div
          className="flex h-full flex-col bg-white"
          variants={screenVariants}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          exit="exit"
          transition={{ duration: 0.4 }}
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FluidLogo className="h-7 w-auto" />
                <span className="text-sm font-bold tracking-[0.02em] text-slate-900">FLUID</span>
              </div>
              <span className="text-xs font-semibold text-slate-900">9:41</span>
            </div>
          </div>

          <motion.div className="flex-1 overflow-y-auto px-4 py-4" variants={containerVariants}>
            <motion.div variants={itemVariants}>
              <h1 className="text-2xl font-bold text-slate-900">You&apos;re all set!</h1>
              <p className="mt-1 text-sm text-slate-600">Ready to make a difference</p>
            </motion.div>

            <motion.div variants={itemVariants} className="mt-6 space-y-3">
              <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-200">
                <p className="font-semibold text-slate-900">✓ Appointment Booked</p>
                <p className="mt-1 text-sm text-slate-600">Today at 2:30 PM</p>
              </div>
              <div className="rounded-xl bg-red-50 p-4 border border-red-200">
                <p className="font-semibold text-slate-900">✓ Request Fulfilled</p>
                <p className="mt-1 text-sm text-slate-600">City General Hospital</p>
              </div>
            </motion.div>
          </motion.div>

          {/* Tab bar */}
          <div className="border-t border-slate-100 flex justify-around px-4 py-3">
            <div className="flex flex-col items-center gap-1">
              <Home className="h-5 w-5 text-red-500" />
              <span className="text-xs text-red-500">Home</span>
            </div>
            <Search className="h-5 w-5 text-slate-400" />
            <Bell className="h-5 w-5 text-slate-400" />
            <Settings className="h-5 w-5 text-slate-400" />
          </div>
        </motion.div>
      );

    default:
      return null;
  }
}
