#pragma once
#include <string>
#include <stdint.h>

unsigned int GetMainThreadId();
void* GetModuleBase();
void* GetModuleBase(const std::string& ModuleName);
inline void* GetBasePointer()
{
	return GetModuleBase();
}

class Pointer
{
public:
	Pointer() : _Pointer(nullptr)
	{
	}
	Pointer(void* Pointer) : _Pointer(Pointer)
	{
	}
	Pointer(size_t Offset) : _Pointer((void*)Offset)
	{
	}
	~Pointer()
	{
	}

	//Resolves offsets the current pointer by the offset and picks up the 4 byte integer value
	// at the new location and returns it as a new pointer object
	inline Pointer operator [](const unsigned int Offset) const
	{
		if( _Pointer )
			if( (unsigned int*)((char*)_Pointer + Offset) )
				return Pointer(*(unsigned int*)((char*)_Pointer + Offset));

		return Pointer(nullptr);
	}

	template <typename T>
	inline T* operator ->() const
	{
		return (T*)_Pointer;
	}

	//Returns the position of the pointer offset by a number of bytes(or stride value)
	inline Pointer operator() (unsigned int Offset = 0, unsigned int Stride = 1) const
	{
		return Pointer((unsigned char*)_Pointer + (Offset*Stride));
	}

	inline Pointer& operator+ (ptrdiff_t offset)
	{
		_Pointer = (uint8_t*)_Pointer + offset;
		return *this;
	}

	//Assignment
	template <class T>
	inline void operator= (T* Pointer)
	{
		_Pointer = (void*)Pointer;
	}

	inline void operator= (Pointer Pointer)
	{
		_Pointer = Pointer._Pointer;
	}

	//Implicit cast to any other pointer type
	template <class T>
	inline operator T* () const
	{
		return (T*)_Pointer;
	}

	inline operator bool() const
	{
		return _Pointer != nullptr ? true : false;
	}

	// Templated write
	template <class T>
	inline void Write(const T value)
	{
		*((T*)_Pointer) = value;
	}

	inline void Write(const void* data,size_t size)
	{
		memcpy(_Pointer, data, size);
	}

	// Templated read

	template <class T>
	inline T& Read()
	{
		return *((T*)_Pointer);
	}

	inline void Read(void* Dest, size_t size)
	{
		memcpy(Dest, _Pointer, size);
	}

	inline static const Pointer Base() 
	{
		const static Pointer ModuleBase(GetModuleBase());
		return ModuleBase;
	}

private:
	void* _Pointer;
};