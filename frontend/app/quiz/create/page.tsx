'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';

interface Question {
  text: string;
  type: string;
  time_limit: number;
  points: number;
  image_url: string | null;
  imageFile?: File | null;
  options: { text: string; is_correct: boolean }[];
}

export default function CreateQuiz() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [uploading, setUploading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Question>({
    text: '',
    type: 'single',
    time_limit: 30,
    points: 100,
    image_url: null,
    imageFile: null,
    options: [{ text: '', is_correct: false }, { text: '', is_correct: false }]
  });

  const uploadImage = async (file: File): Promise<string | null> => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('image', file);

    try {
      setUploading(true);
      const response = await axios.post('http://localhost:5000/api/quizzes/upload-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });
      return response.data.imageUrl;
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload image');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = await uploadImage(file);
      if (imageUrl) {
        setCurrentQuestion({
          ...currentQuestion,
          image_url: imageUrl,
          imageFile: file
        });
      }
    }
  };

  const removeImage = () => {
    setCurrentQuestion({
      ...currentQuestion,
      image_url: null,
      imageFile: null
    });
  };

  const addQuestion = async () => {
    if (!currentQuestion.text) {
      alert('Please enter question text');
      return;
    }

    if (currentQuestion.options.some(opt => !opt.text)) {
      alert('Please fill all options');
      return;
    }

    if (!currentQuestion.options.some(opt => opt.is_correct)) {
      alert('Please mark at least one correct answer');
      return;
    }

    // Upload image if present
    let finalImageUrl = currentQuestion.image_url;
    if (currentQuestion.imageFile) {
      const uploadedUrl = await uploadImage(currentQuestion.imageFile);
      if (uploadedUrl) {
        finalImageUrl = uploadedUrl;
      }
    }

    const questionToAdd = {
      ...currentQuestion,
      image_url: finalImageUrl
    };

    setQuestions([...questions, questionToAdd]);
    setCurrentQuestion({
      text: '',
      type: 'single',
      time_limit: 30,
      points: 100,
      image_url: null,
      imageFile: null,
      options: [{ text: '', is_correct: false }, { text: '', is_correct: false }]
    });
  };

  const updateOption = (index: number, text: string) => {
    const newOptions = [...currentQuestion.options];
    newOptions[index].text = text;
    setCurrentQuestion({ ...currentQuestion, options: newOptions });
  };

  const toggleCorrect = (index: number) => {
    const newOptions = [...currentQuestion.options];
    if (currentQuestion.type === 'single') {
      newOptions.forEach((opt, i) => opt.is_correct = i === index);
    } else {
      newOptions[index].is_correct = !newOptions[index].is_correct;
    }
    setCurrentQuestion({ ...currentQuestion, options: newOptions });
  };

  const addOption = () => {
    setCurrentQuestion({
      ...currentQuestion,
      options: [...currentQuestion.options, { text: '', is_correct: false }]
    });
  };

  const removeOption = (index: number) => {
    if (currentQuestion.options.length <= 2) {
      alert('Minimum 2 options required');
      return;
    }
    const newOptions = currentQuestion.options.filter((_, i) => i !== index);
    setCurrentQuestion({ ...currentQuestion, options: newOptions });
  };

  const handleSubmit = async () => {
    if (!title) {
      alert('Please enter quiz title');
      return;
    }

    if (questions.length === 0) {
      alert('Please add at least one question');
      return;
    }

    const token = localStorage.getItem('token');
    try {
      const response = await axios.post(
        'http://localhost:5000/api/quizzes',
        {
          title,
          description,
          category,
          questions: questions.map(q => ({
            text: q.text,
            type: q.type,
            time_limit: q.time_limit,
            points: q.points,
            image_url: q.image_url,
            options: q.options
          }))
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      router.push(`/quiz/lobby/${response.data.roomCode}`);
    } catch (error) {
      console.error('Failed to create quiz', error);
      alert('Failed to create quiz');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 py-8">
      <div className="container mx-auto px-6">
        <h1 className="text-3xl font-bold mb-8">Create New Quiz</h1>

        <div className="bg-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Quiz Details</h2>
          <input
            type="text"
            placeholder="Quiz Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field mb-4"
          />
          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field mb-4"
            rows={3}
          />
          <input
            type="text"
            placeholder="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-field mb-4"
          />
        </div>

        <div className="bg-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Add Question</h2>
          <input
            type="text"
            placeholder="Question Text"
            value={currentQuestion.text}
            onChange={(e) => setCurrentQuestion({ ...currentQuestion, text: e.target.value })}
            className="input-field mb-4"
          />

          {/* Image Upload Section */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Question Image (Optional)</label>
            <div className="border-2 border-dashed border-gray-600 rounded-lg p-4 text-center">
              {currentQuestion.image_url ? (
                <div className="relative">
                  <div className="relative h-48 w-full mb-2">
                    <Image
                      src={`http://backend:5000${currentQuestion.image_url}`}
                      alt="Question"
                      fill
                      className="object-contain rounded-lg"
                    />
                  </div>
                  <button
                    onClick={removeImage}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm"
                  >
                    Remove Image
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                    disabled={uploading}
                  />
                  <label
                    htmlFor="image-upload"
                    className="cursor-pointer inline-block bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
                  >
                    {uploading ? 'Uploading...' : 'Upload Image'}
                  </label>
                  <p className="text-sm text-gray-400 mt-2">
                    Supported formats: JPEG, PNG, GIF, WEBP (Max 5MB)
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 mb-4">
            <select
              value={currentQuestion.type}
              onChange={(e) => setCurrentQuestion({ ...currentQuestion, type: e.target.value })}
              className="input-field"
            >
              <option value="single">Single Choice</option>
              <option value="multiple">Multiple Choice</option>
            </select>

            <input
              type="number"
              placeholder="Time Limit"
              value={currentQuestion.time_limit}
              onChange={(e) => setCurrentQuestion({ ...currentQuestion, time_limit: parseInt(e.target.value) })}
              className="input-field"
            />

            <input
              type="number"
              placeholder="Points"
              value={currentQuestion.points}
              onChange={(e) => setCurrentQuestion({ ...currentQuestion, points: parseInt(e.target.value) })}
              className="input-field"
            />
          </div>

          <h3 className="font-bold mb-2">Options</h3>
          {currentQuestion.options.map((option, idx) => (
            <div key={idx} className="flex gap-4 mb-2">
              <input
                type="text"
                placeholder={`Option ${idx + 1}`}
                value={option.text}
                onChange={(e) => updateOption(idx, e.target.value)}
                className="input-field flex-1"
              />
              <button
                onClick={() => toggleCorrect(idx)}
                className={`px-4 py-2 rounded-lg ${
                  option.is_correct ? 'bg-green-600' : 'bg-gray-700'
                }`}
              >
                {option.is_correct ? '✓ Correct' : 'Set Correct'}
              </button>
              <button
                onClick={() => removeOption(idx)}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700"
              >
                ✗
              </button>
            </div>
          ))}

          <div className="flex gap-4 mt-4">
            <button onClick={addOption} className="btn-secondary">+ Add Option</button>
            <button onClick={addQuestion} className="btn-primary">Add Question</button>
          </div>
        </div>

        {questions.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Questions ({questions.length})</h2>
            <div className="space-y-4">
              {questions.map((q, idx) => (
                <div key={idx} className="bg-gray-700 p-4 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-bold">{idx + 1}. {q.text}</p>
                      {q.image_url && (
                        <div className="relative h-32 w-48 mt-2">
                          <Image
                            src={`http://backend:5000${q.image_url}`}
                            alt="Question"
                            fill
                            className="object-contain rounded"
                          />
                        </div>
                      )}
                      <p className="text-sm text-gray-400 mt-2">
                        Type: {q.type === 'single' ? 'Single Choice' : 'Multiple Choice'} |
                        Points: {q.points} |
                        Time: {q.time_limit}s
                      </p>
                      <p className="text-sm mt-1">
                        Options: {q.options.map((opt, i) => (
                          <span key={i} className={`mr-2 ${opt.is_correct ? 'text-green-400' : 'text-gray-400'}`}>
                            {opt.text}{opt.is_correct ? ' ✓' : ''}
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleSubmit} className="btn-primary text-lg px-8 py-3">
          Create Quiz & Continue
        </button>
      </div>
    </div>
  );
}