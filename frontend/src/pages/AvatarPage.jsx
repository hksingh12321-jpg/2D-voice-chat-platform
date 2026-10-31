import React, { useEffect, useState } from 'react';

const AvatarPage = ({ onSelectAvatar }) => {
    const [avatars, setAvatars] = useState([]);
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch('https://twod-room-voicechat.onrender.com/api/avatars')
            .then(res => res.json())
            .then(data => {
                setAvatars(data);
                setLoading(false);
            })
            .catch(() => {
                setError('Failed to load avatars');
                setLoading(false);
            });
    }, []);

    const handleSelect = (avatar) => {
        setSelected(avatar);
    };

    const handleContinue = () => {
        if (selected) onSelectAvatar(selected);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100 px-4 py-8">
            <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl p-8">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">
                        Choose Your Avatar
                    </h2>
                    <p className="text-gray-600">
                        Select an avatar to represent yourself
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start mb-6">
                        <svg className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <svg className="animate-spin h-12 w-12 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
                            {avatars.map(avatar => (
                                <div
                                    key={avatar.id}
                                    onClick={() => handleSelect(avatar)}
                                    className={`
                                        relative cursor-pointer rounded-xl p-4 transition-all duration-200 transform hover:scale-105
                                        ${selected?.id === avatar.id 
                                            ? 'bg-indigo-50 border-2 border-indigo-500 shadow-lg' 
                                            : 'bg-gray-50 border-2 border-gray-200 hover:border-indigo-300 hover:shadow-md'
                                        }
                                    `}
                                >
                                    {selected?.id === avatar.id && (
                                        <div className="absolute -top-2 -right-2 bg-indigo-500 rounded-full p-1">
                                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    )}
                                    <div className="flex flex-col items-center">
                                        <div className="w-16 h-16 mb-3 rounded-full overflow-hidden bg-white shadow-sm">
                                            <img 
                                                src={avatar.image} 
                                                alt={avatar.name} 
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <span className={`
                                            text-sm font-medium text-center
                                            ${selected?.id === avatar.id ? 'text-indigo-700' : 'text-gray-700'}
                                        `}>
                                            {avatar.name}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {avatars.length === 0 && !error && (
                            <div className="text-center py-12 text-gray-500">
                                No avatars available
                            </div>
                        )}

                        <div className="flex justify-center">
                            <button
                                onClick={handleContinue}
                                disabled={!selected}
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:bg-gray-400"
                            >
                                {selected ? 'Continue' : 'Select an Avatar'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AvatarPage;