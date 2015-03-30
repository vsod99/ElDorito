#pragma once

#include "ElModule.h"

class LoadLevel : public ElModule
{
public:
	LoadLevel();
	~LoadLevel();

	std::string Info();

	void Tick(const std::chrono::duration<double>& Delta);
	bool Run(const std::vector<std::string>& Args);

private:
	std::vector<std::string> MapList;
};