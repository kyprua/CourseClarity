import React, { useState } from 'react';
import { Upload, X, BookOpen, Clock, TrendingUp, LogOut, User } from 'lucide-react';

const SyllabusAnalyzer = () => {
  // In-memory user database (persists during session only)
  const [users, setUsers] = useState({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: '', password: '', name: '' });
  const [authError, setAuthError] = useState('');
  
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');

    if (!formData.email || !formData.password) {
      setAuthError('Please fill in all fields');
      return;
    }

    if (!isLogin && !formData.name) {
      setAuthError('Please enter your name');
      return;
    }

    if (isLogin) {
      // Login
      const user = users[formData.email];
      
      if (!user) {
        setAuthError('User not found. Please sign up first.');
        return;
      }

      if (user.password !== formData.password) {
        setAuthError('Incorrect password');
        return;
      }

      setCurrentUser(user);
      setIsAuthenticated(true);
      setCourses(user.courses || []);
      
    } else {
      // Sign up
      if (users[formData.email]) {
        setAuthError('User already exists. Please login.');
        return;
      }

      const newUser = {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        courses: [],
        createdAt: Date.now()
      };

      setUsers({ ...users, [formData.email]: newUser });
      setCurrentUser(newUser);
      setIsAuthenticated(true);
      setCourses([]);
    }

    setFormData({ email: '', password: '', name: '' });
  };

  const handleLogout = () => {
    // Save courses back to user before logout
    if (currentUser) {
      setUsers({
        ...users,
        [currentUser.email]: {
          ...currentUser,
          courses: courses
        }
      });
    }
    
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCourses([]);
    setFormData({ email: '', password: '', name: '' });
  };

    const analyzeSyllabus = async (text, fileName) => {
    try {
      console.log("Extracted text length:", text.length);
      console.log("First 500 chars:", text.substring(0, 500));
      const GEMINI_API_KEY = "YOUR_API_KEY";
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Analyze this college course syllabus and provide:
1. Course name
2. Estimated hours per week (consider assignments, readings, projects, exams)
3. Difficulty rating out of 10 (consider course level, prerequisites, workload, grading)

Respond ONLY with a JSON object in this exact format:
{
  "courseName": "Course Name",
  "hoursPerWeek": 12,
  "difficulty": 7.5,
  "reasoning": "Brief explanation of the estimates"
}

Syllabus text:
${text.substring(0, 8000)}`
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();
      console.log("API response:", data);
      
      if (!response.ok) {
        throw new Error(data.error.message || "API error occurred");
      }
      
      const text_content = data.candidates[0].content.parts[0].text;
      console.log("Extracted content:", text_content);
      
      const cleanText = text_content.replace(/```json|```/g, "").trim();
      const analysis = JSON.parse(cleanText);
      
      return {
        id: Date.now(),
        fileName,
        ...analysis
      };
    } catch (err) {
      console.error("Analysis error details:", err);
      throw new Error(`Failed to analyze: ${err.message}`);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      const text = await extractTextFromPDF(uint8Array);
      
      if (!text || text.length < 100) {
        throw new Error('Could not extract enough text from PDF');
      }

      const analysis = await analyzeSyllabus(text, file.name);
      const updatedCourses = [...courses, analysis];
      setCourses(updatedCourses);
      
      // Update user's courses in memory
      setUsers({
        ...users,
        [currentUser.email]: {
          ...currentUser,
          courses: updatedCourses
        }
      });
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const extractTextFromPDF = async (uint8Array) => {
    // Convert uint8Array to string in chunks to avoid stack overflow
    let text = '';
    const chunkSize = 10000;
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      text += String.fromCharCode.apply(null, chunk);
    }
    
    // Try to extract text between parentheses (common in PDFs)
    const textContent = text.match(/\(([^)]+)\)/g);
    
    if (textContent && textContent.length > 10) {
      return textContent.map(match => match.slice(1, -1)).join(' ');
    }
    
    // Fallback: decode as UTF-8 and clean
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(uint8Array).replace(/[^\x20-\x7E\n]/g, ' ');
  };

  const removeCourse = (id) => {
    const updatedCourses = courses.filter(c => c.id !== id);
    setCourses(updatedCourses);
    
    // Update user's courses in memory
    setUsers({
      ...users,
      [currentUser.email]: {
        ...currentUser,
        courses: updatedCourses
      }
    });
  };

  const avgHours = courses.length > 0 
    ? (courses.reduce((sum, c) => sum + c.hoursPerWeek, 0) / courses.length).toFixed(1)
    : 0;

  const avgDifficulty = courses.length > 0
    ? (courses.reduce((sum, c) => sum + c.difficulty, 0) / courses.length).toFixed(1)
    : 0;

  const totalHours = courses.reduce((sum, c) => sum + c.hoursPerWeek, 0);

  // Authentication Page
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <BookOpen className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-indigo-900 mb-2">
              Syllabus Analyzer
            </h1>
            <p className="text-gray-600">
              {isLogin ? 'Welcome back!' : 'Create your account'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="Enter your name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                placeholder="Enter your password"
              />
            </div>

            {authError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition"
            >
              {isLogin ? 'Login' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setAuthError('');
                setFormData({ email: '', password: '', name: '' });
              }}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Application
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-indigo-900 mb-2">
              College Syllabus Analyzer
            </h1>
            <p className="text-indigo-700">
              Upload your course syllabi to estimate workload and difficulty
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow">
              <User className="w-5 h-5 text-indigo-600" />
              <span className="font-medium text-gray-800">{currentUser.name}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-300 rounded-lg p-8 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition">
            <Upload className="w-12 h-12 text-indigo-500 mb-4" />
            <span className="text-lg font-medium text-indigo-900 mb-2">
              {loading ? 'Analyzing syllabus...' : 'Upload Syllabus PDF'}
            </span>
            <span className="text-sm text-gray-600">
              Click to browse or drag and drop
            </span>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              disabled={loading}
              className="hidden"
            />
          </label>
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Semester Overview */}
        {courses.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold text-indigo-900 mb-6">
              Semester Overview
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white">
                <div className="flex items-center mb-2">
                  <BookOpen className="w-6 h-6 mr-2" />
                  <span className="text-sm font-medium opacity-90">Total Courses</span>
                </div>
                <div className="text-4xl font-bold">{courses.length}</div>
              </div>

              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white">
                <div className="flex items-center mb-2">
                  <Clock className="w-6 h-6 mr-2" />
                  <span className="text-sm font-medium opacity-90">Total Hours/Week</span>
                </div>
                <div className="text-4xl font-bold">{totalHours}</div>
                <div className="text-sm opacity-90 mt-1">Avg: {avgHours} hrs/course</div>
              </div>

              <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg p-6 text-white">
                <div className="flex items-center mb-2">
                  <TrendingUp className="w-6 h-6 mr-2" />
                  <span className="text-sm font-medium opacity-90">Avg Difficulty</span>
                </div>
                <div className="text-4xl font-bold">{avgDifficulty}/10</div>
                <div className="text-sm opacity-90 mt-1">
                  {avgDifficulty < 5 ? 'Manageable' : avgDifficulty < 7 ? 'Moderate' : 'Challenging'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Course Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {courses.map(course => (
            <div key={course.id} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-indigo-900 mb-1">
                    {course.courseName}
                  </h3>
                  <p className="text-sm text-gray-600">{course.fileName}</p>
                </div>
                <button
                  onClick={() => removeCourse(course.id)}
                  className="text-gray-400 hover:text-red-500 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-700 font-medium">Time Commitment</span>
                  <span className="text-2xl font-bold text-indigo-600">
                    {course.hoursPerWeek} hrs/week
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-700 font-medium">Difficulty</span>
                    <span className="text-2xl font-bold text-pink-600">
                      {course.difficulty}/10
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 h-2 rounded-full transition-all"
                      style={{ width: `${course.difficulty * 10}%` }}
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-600 italic">
                    {course.reasoning}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {courses.length === 0 && !loading && (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-indigo-300 mx-auto mb-4" />
            <p className="text-xl text-indigo-900 font-medium">
              No courses added yet
            </p>
            <p className="text-gray-600 mt-2">
              Upload a syllabus PDF to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SyllabusAnalyzer;