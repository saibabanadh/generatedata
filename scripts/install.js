require([
	"manager",
	"lang",
	"utils",
	"pageinit",
	"jquery-ui",
	"jquery-json",
], function(manager, L, utils) {

	// everything in this module is private, but we re-use the _ notation here just to signify scope
	var _currStep = 1;
	var _dbSettings = {};
	var _successfullyInstalledDataTypes = [];
	var _successfullyInstalledExportTypes = [];
	var _successfullyInstalledCountries = [];


	// used as an iterator to install the plugins one by one
	var _currIndex = 0;

	$(function() {
		$("#dbHostname").select();
		$("form").bind("submit", submit);
		$("input[name=employUserAccounts]").bind("click", _toggleUserAccountSection);
		$("#pluginInstallationResults").on("click", ".gdError", _displayPluginInstallationError);

		_toggleUserAccountSection();

		// figure out what page we're on. In 99% of cases, it'll be page 1 - but in case the user didn't finish
		// installing the script last time 'round, it will return them to the appropriate step.
		var selectedNavPage = $("#gdInstallNav li.selected");
		if (selectedNavPage.length) {
			_currStep = parseInt(selectedNavPage.attr("id").replace(/^nav/, ""), 10);
		}
	});

	function _toggleUserAccountSection() {
		var value = $("input[name=employUserAccounts]:checked").val();
		var rowSelector = ".gdEmailRow,.gdPasswordRow,.gdFirstNameRow,.gdLastNameRow,.gdAdminAccountHeading";
		if (value == "yes") {
			$(rowSelector).removeClass("gdDisabledRow").find("input").removeAttr("disabled");
		} else {
			$(rowSelector).addClass("gdDisabledRow").find("input").attr("disabled", "disabled");
		}
	}

	function _displayPluginInstallationError(e) {
		$("<div>" + $(e.target).data("error") + "</div>").dialog({
			autoOpen:  true,
			modal:     true,
			resizable: false,
			title:     "Installation error",
			width:     300
		});
	}

	function submit() {
		$(".gdError").hide();
		var errors = [];

		switch (_currStep) {

			// this validates the tab, and stores the database info in
			case 1:
				var validChars = /[^a-zA-Z0-9_]/;
				var dbHostname = $("#dbHostname").val();
				if ($.trim(dbHostname) == "") {
					errors.push({ fieldId: "dbHostname", error: L.validation_no_db_hostname });
				}

				var dbName = $.trim($("#dbName").val());
				if (dbName == "") {
					errors.push({ fieldId: "dbName", error: L.validation_no_db_name });
				} else if (validChars.test(dbName)) {
					errors.push({ fieldId: "dbName", error: L.validation_invalid_chars });
				}

				var dbUsername = $.trim($("#dbUsername").val());
				if (dbUsername == "") {
					errors.push({ fieldId: "dbUsername", error: L.validation_no_mysql_username });
				} else if (validChars.test(dbUsername)) {
					errors.push({ fieldId: "dbUsername", error: L.validation_invalid_chars });
				}

				// the password is optional (e.g. for local environments)
				var dbPassword = $.trim($("#dbPassword").val());

				var dbTablePrefix = $.trim($("#dbTablePrefix").val());
				if (validChars.test(dbTablePrefix)) {
					errors.push({ fieldId: "dbTablePrefix", error: L.validation_invalid_chars });
				}

				if (errors.length) {
					$("#" + errors[0].fieldId).select();
					for (var i=0; i<errors.length; i++) {
						$("#" + errors[i].fieldId + "_error").html(errors[i].error).fadeIn(300);
					}
					return false;
				}

				// all looks good! Keep track of the inputted vars for later use
				_dbSettings = {
					dbHostname: dbHostname,
					dbName: dbName,
					dbUsername: dbUsername,
					dbPassword: dbPassword,
					dbTablePrefix: dbTablePrefix
				}

				utils.startProcessing();
				$.ajax({
					url: "ajax.php",
					type: "POST",
					dataType: "json",
					data: {
						action: "installation_test_db_settings",
						dbHostname: dbHostname,
						dbName: dbName,
						dbUsername: dbUsername,
						dbPassword: dbPassword
					},
					success: function(json) {
						utils.stopProcessing();
						if (json.success == 0) {
							_displayError(json.message);
						} else {
							gotoNextPage();
						}
					},
					error: installError
				});
				break;

			case 2:
				utils.startProcessing();
				$.ajax({
					url: "ajax.php",
					type: "POST",
					dataType: "json",
					data: {
						action: "installation_create_settings_file",
						dbHostname: _dbSettings.dbHostname,
						dbName: _dbSettings.dbName,
						dbUsername: _dbSettings.dbUsername,
						dbPassword: _dbSettings.dbPassword,
						dbTablePrefix: _dbSettings.dbTablePrefix
					},
					success: function(json) {
						utils.stopProcessing();
						if (json.success == 0) {
							_displayError(json.message);
						} else {
							gotoNextPage();
						}
					},
					error: installError
				});
				break;

			case 3:
				var employUserAccounts = $("input[name=employUserAccounts]:checked").val();
				var firstName = "";
				var lastName = "";
				var email = "";
				var password = "";

				if (employUserAccounts == "yes") {
					firstName = $.trim($("#firstName").val());
					if (firstName == "") {
						errors.push({ fieldId: "firstName", error: L.validation_no_first_name });
					}
					lastName = $.trim($("#lastName").val());
					if (lastName == "") {
						errors.push({ fieldId: "lastName", error: L.validation_no_last_name });
					}
					email = $.trim($("#email").val());
					if (email == "") {
						errors.push({ fieldId: "email", error: L.validation_no_email });
					}
					password = $.trim($("#password").val());
					if (password == "") {
						errors.push({ fieldId: "password", error: L.validation_no_password });
					}
				}

				if (errors.length) {
					$("#" + errors[0].fieldId).select();
					for (var i=0; i<errors.length; i++) {
						$("#" + errors[i].fieldId + "_error").html(errors[i].error).fadeIn(300);
					}
					return false;
				}

				utils.startProcessing();
				$.ajax({
					url: "ajax.php",
					type: "POST",
					dataType: "json",
					data: {
						action: "installation_create_database",
						employUserAccounts: employUserAccounts,
						firstName: firstName,
						lastName: lastName,
						email: email,
						password: password
					},
					success: function(json) {
						utils.stopProcessing();
						if (json.success == 0) {
							_displayError(json.message);
						} else {
							gotoNextPage();
						}
					},
					error: installError
				});
				break;

			case 4:
				utils.startProcessing();
				$("#pluginInstallationResults").removeClass("hidden");
				$("#gdInstallPluginsBtn").hide();
				$("#pluginInstallationResults .gdResponse").html("");
				installDataTypes();
				break;

			case 5:
				// temporary hack!
				_currStep--;

				gotoNextPage();
				break;
		}

		return false;
	}


	function installDataTypes() {
		$.ajax({
			url: "ajax.php",
			type: "POST",
			dataType: "json",
			data: {
				action: "installation_data_types",
				index: _currIndex
			},
			success: installDataTypeResponse,
			error: installError
		});
	}


	function installDataTypeResponse(json) {
		// once all data types are installed, send the list of successful installations to the server
		if (json.isComplete) {
			$.ajax({
				url: "ajax.php",
				type: "POST",
				dataType: "json",
				data: {
					action: "installation_save_data_types",
					folders: _successfullyInstalledDataTypes.toString()
				},
				success: function(json) {
					// now proceed to the Export Types
					_currIndex = 0;
					installExportTypes();
				},
				error: installError
			});
		} else {
			var str = "";
			if (json.success) {
				str = json.dataTypeName + " <span class=\"gdSuccess\">success</span>";
				_successfullyInstalledDataTypes.push(json.dataTypeFolder);
			} else {
				str = json.dataTypeName + " <span class=\"gdError\" data-error=\"" + json.message + "\">error</span>";
			}
			$("#gdDataTypeResponse").append("<div>" + str + "</div>");

			_currIndex++;
			installDataTypes();
		}
	}

	function installExportTypes() {
		$.ajax({
			url: "ajax.php",
			type: "POST",
			dataType: "json",
			data: {
				action: "installation_export_types",
				index: _currIndex
			},
			success: installExportTypesResponse,
			error: installError
		});
	}


	function installExportTypesResponse(json) {
		if (json.isComplete) {
			$.ajax({
				url: "ajax.php",
				type: "POST",
				dataType: "json",
				data: {
					action: "installation_save_export_types",
					folders: _successfullyInstalledExportTypes.toString()
				},
				success: function(json) {
					// now proceed to the Export Types
					_currIndex = 0;
					installCountries();
				},
				error: installError
			});
		} else {
			var str = "";
			if (json.success) {
				str = json.exportTypeName + " <span class=\"gdSuccess\">success</span>";
				_successfullyInstalledExportTypes.push(json.exportTypeFolder);
			} else {
				str = json.exportTypeName + " <span class=\"gdError\" data-error=\"" + json.message + "\">error</span>";
			}
			$("#gdExportTypeResponse").append("<div>" + str + "</div>");

			_currIndex++;
			installExportTypes();
		}
	}


	function installCountries(index) {
		$.ajax({
			url: "ajax.php",
			type: "POST",
			dataType: "json",
			data: {
				action: "installation_countries",
				index: _currIndex
			},
			success: installCountriesResponse,
			error: installError
		});

		utils.stopProcessing();
	}


	function installCountriesResponse(json) {
		if (json.isComplete) {
			$.ajax({
				url: "ajax.php",
				type: "POST",
				dataType: "json",
				data: {
					action: "installation_save_countries",
					folders: _successfullyInstalledCountries.toString()
				},
				success: function(json) {
					_currIndex = 0;
					$("#gdInstallPluginsBtn").html("Continue &raquo;").show();
					_currStep++;
				},
				error: installError
			});
		} else {
			var str = "";
			if (json.success) {
				str = json.countryName + " <span class=\"gdSuccess\">success</span>";
				_successfullyInstalledCountries.push(json.countryFolder);
			} else {
				str = json.countryName + " <span class=\"gdError\" data-error=\"" + json.message + "\">error</span>";
			}
			$("#gdCountriesResponse").append("<div>" + str + "</div>");

			_currIndex++;
			installCountries();
		}
	}


	function gotoNextPage() {
		$("#nav" + _currStep).removeClass("selected").addClass("complete");
		$("#page" + _currStep).addClass("hidden");

		_currStep += 1;
		$("#nav" + _currStep).addClass("selected");
		$("#page" + _currStep).removeClass("hidden");
	}


	/**
	 * Display the installation response. This contains details about all Data Types, Export Types and Country-specific
	 * data installed.
	 */
	function continueInstallationProcess(json) {
		utils.stopProcessing();
		if (json.success) {
			_displayError(json.message);
		} else {
			utils.displayMessage("gdInstallMessage", json.message);
		}
		return;
	}


	function _displayError(message) {
		$("#page" + _currStep + " .gdInstallTabMessage .gdResponse").html(message);
		$("#page" + _currStep + " .gdInstallTabMessage").addClass("gdInstallError").show();
	}

	/**
	 * In case of any Ajax error.
	 */
	function installError(json) {
		utils.stopProcessing();
		_displayError(json.message);
	}

});
