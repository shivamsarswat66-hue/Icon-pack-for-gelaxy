/**
 * CineMatch movie knowledge base.
 * Compact tuple format -> parsed into rich objects at load time.
 * [title, year, industry, rating, runtime, director, genres, keywords, synopsis]
 *
 * industry: HW=Hollywood, BW=Bollywood, IN=Indian regional, KO=Korean,
 *           JP=Japanese/Anime, EU=European/UK, WO=World cinema
 */
const RAW = [
  // ---------- Sci-Fi / mind-benders ----------
  ["Inception", 2010, "HW", 8.8, 148, "Christopher Nolan", "Sci-Fi|Thriller|Action", "dreams|heist|mind-bending|twist|nonlinear|obsession", "A thief who steals ideas from dreams is offered one last job: plant an idea instead of stealing it."],
  ["Interstellar", 2014, "HW", 8.7, 169, "Christopher Nolan", "Sci-Fi|Drama|Adventure", "space|time-travel|family|survival|epic|emotional", "A pilot leaves his children behind to find a new home for humanity across a collapsing universe."],
  ["The Matrix", 1999, "HW", 8.7, 136, "Lana & Lilly Wachowski", "Sci-Fi|Action|Thriller", "dystopia|simulation|martial-arts|classic|mind-bending", "A hacker discovers everyday reality is a simulation and joins the fight to wake everyone up."],
  ["Blade Runner 2049", 2017, "HW", 8.0, 164, "Denis Villeneuve", "Sci-Fi|Mystery|Drama", "identity|neo-noir|slow-burn|atmospheric|rain|robot", "A replicant detective hunts a secret that could break the wall between humans and machines."],
  ["Arrival", 2016, "HW", 7.9, 116, "Denis Villeneuve", "Sci-Fi|Drama|Mystery", "aliens|language|time-travel|grief|emotional|slow-burn", "A linguist races to understand an alien language before fear turns first contact into war."],
  ["Ex Machina", 2014, "HW", 7.7, 108, "Alex Garland", "Sci-Fi|Thriller|Mystery", "ai|robot|isolation|manipulation|slow-burn", "A young coder is invited to test whether a beautiful machine truly thinks for itself."],
  ["The Prestige", 2006, "HW", 8.5, 130, "Christopher Nolan", "Mystery|Drama|Thriller", "magic|rivalry|obsession|twist|nonlinear|classic", "Two stage magicians destroy each other in a race to own the perfect illusion."],
  ["Memento", 2000, "HW", 8.4, 113, "Christopher Nolan", "Mystery|Thriller", "memory|nonlinear|revenge|twist|neo-noir", "A man who cannot form new memories hunts his wife's killer using notes on his own skin."],
  ["Dune", 2021, "HW", 8.0, 155, "Denis Villeneuve", "Sci-Fi|Adventure|Drama", "desert|prophecy|epic|empire|slow-burn|spectacle", "A noble heir is thrown into a desert war over the only resource that matters."],
  ["Dune: Part Two", 2024, "HW", 8.5, 166, "Denis Villeneuve", "Sci-Fi|Adventure|War", "desert|prophecy|epic|revenge|spectacle|messiah", "The heir becomes a leader, and the prophecy he rides turns out to be a weapon."],
  ["The Martian", 2015, "HW", 8.0, 144, "Ridley Scott", "Sci-Fi|Adventure|Comedy", "space|survival|science|humor|feel-good", "An astronaut stranded on Mars decides the only way home is one clever problem at a time."],
  ["Gravity", 2013, "HW", 7.7, 91, "Alfonso Cuarón", "Sci-Fi|Thriller|Drama", "space|survival|isolation|tension|spectacle", "After a disaster in orbit, one woman has 90 minutes of air and no one coming to help."],
  ["Edge of Tomorrow", 2014, "HW", 7.9, 113, "Doug Liman", "Sci-Fi|Action|Adventure", "time-travel|aliens|war|humor|spectacle", "A cowardly soldier dies on the battlefield and wakes up to fight the same day again."],
  ["Looper", 2012, "HW", 7.4, 119, "Rian Johnson", "Sci-Fi|Action|Crime", "time-travel|hitman|neo-noir|twist", "A hitman for the mob is sent the one target he cannot bring himself to shoot: himself."],
  ["Predestination", 2014, "HW", 7.5, 97, "The Spierig Brothers", "Sci-Fi|Mystery|Thriller", "time-travel|twist|paradox|mind-bending", "A time agent takes one last assignment, and the timeline folds back on itself."],
  ["Coherence", 2013, "HW", 7.2, 89, "James Ward Byrkit", "Sci-Fi|Mystery|Thriller", "dinner-party|parallel|mind-bending|indie|tension", "A comet passes overhead and a friendly dinner party starts meeting its other selves."],
  ["Moon", 2009, "HW", 7.8, 97, "Duncan Jones", "Sci-Fi|Drama|Mystery", "isolation|clone|space|slow-burn|identity", "A lunar caretaker nearing the end of his contract meets someone who looks exactly like him."],
  ["Children of Men", 2006, "HW", 7.9, 109, "Alfonso Cuarón", "Sci-Fi|Drama|Thriller", "dystopia|survival|tension|spectacle|grief", "In a world where no child has been born for years, one woman is suddenly pregnant."],
  ["Her", 2013, "HW", 8.0, 126, "Spike Jonze", "Sci-Fi|Romance|Drama", "ai|loneliness|love|emotional|slow-burn", "A lonely writer falls in love with the voice in his new operating system."],
  ["Eternal Sunshine of the Spotless Mind", 2004, "HW", 8.3, 108, "Michel Gondry", "Romance|Sci-Fi|Drama", "memory|love|surreal|bittersweet|nonlinear", "Two exes erase each other from memory, then fight the erasure from inside their own heads."],
  ["Donnie Darko", 2001, "HW", 7.9, 113, "Richard Kelly", "Sci-Fi|Mystery|Drama", "time-travel|teen|surreal|mind-bending|cult", "A troubled teenager is warned by a giant rabbit that the world ends in 28 days."],
  ["Tenet", 2020, "HW", 7.3, 150, "Christopher Nolan", "Sci-Fi|Action|Thriller", "time-travel|spy|mind-bending|spectacle", "A spy learns to move backwards through time to stop a war that has already happened."],
  ["Annihilation", 2018, "HW", 6.8, 115, "Alex Garland", "Sci-Fi|Horror|Mystery", "aliens|surreal|expedition|slow-burn|atmospheric", "A biologist enters a shimmering zone where nature is rewriting itself."],
  ["The Truman Show", 1998, "HW", 8.2, 103, "Peter Weir", "Drama|Sci-Fi|Comedy", "satire|identity|media|feel-good|classic", "A cheerful insurance man slowly realises his whole town is a television set."],
  ["Everything Everywhere All at Once", 2022, "HW", 7.8, 139, "Daniels", "Sci-Fi|Comedy|Action", "multiverse|absurd|family|emotional|mind-bending", "A laundromat owner discovers every life she never lived is a weapon she can borrow."],
  ["Back to the Future", 1985, "HW", 8.5, 116, "Robert Zemeckis", "Sci-Fi|Adventure|Comedy", "time-travel|classic|feel-good|humor|cult", "A teenager accidentally becomes his own mother's crush after a trip to 1955."],
  ["Oppenheimer", 2023, "HW", 8.3, 180, "Christopher Nolan", "Biography|Drama|Thriller", "science|wwii|nonlinear|obsession|epic|true-story", "The physicist who built the bomb is put on trial by the country he armed."],

  // ---------- Action / Crime / Thriller ----------
  ["The Dark Knight", 2008, "HW", 9.0, 152, "Christopher Nolan", "Action|Crime|Thriller", "superhero|villain|moral|epic|classic|tension", "A masked anarchist pushes a city's hero to choose between his rules and its people."],
  ["Mad Max: Fury Road", 2015, "HW", 8.1, 120, "George Miller", "Action|Adventure|Sci-Fi", "post-apocalypse|chase|practical-effects|spectacle|epic", "A silent drifter and a runaway commander flee a warlord across a desert wasteland."],
  ["John Wick", 2014, "HW", 7.4, 101, "Chad Stahelski", "Action|Thriller|Crime", "revenge|hitman|martial-arts|stylized|spectacle", "A retired assassin goes to war with an entire underworld over a dog."],
  ["Mission: Impossible – Fallout", 2018, "HW", 7.7, 147, "Christopher McQuarrie", "Action|Thriller|Adventure", "spy|chase|stunts|spectacle|tension", "An agent takes the fall for a mission he failed and must earn his team back."],
  ["Top Gun: Maverick", 2022, "HW", 8.2, 130, "Joseph Kosinski", "Action|Drama|Adventure", "fighter-pilot|legacy|spectacle|feel-good|stunts", "The fastest pilot in the navy is sent back to teach the mission nobody survives."],
  ["The Raid", 2011, "WO", 7.6, 101, "Gareth Evans", "Action|Crime|Thriller", "martial-arts|brutal|tension|stylized|raid", "A SWAT team fights floor by floor up a building owned by a crime boss."],
  ["Oldboy", 2003, "KO", 8.3, 120, "Park Chan-wook", "Thriller|Mystery|Action", "revenge|twist|brutal|korean|obsession", "A man locked away for fifteen years is released with a phone, a wallet and five days."],
  ["Parasite", 2019, "KO", 8.5, 132, "Bong Joon-ho", "Thriller|Drama|Comedy", "class|satire|twist|korean|dark-comedy|tense", "A poor family slowly moves into the lives of a rich one, until the basement answers back."],
  ["Memories of Murder", 2003, "KO", 8.1, 132, "Bong Joon-ho", "Crime|Thriller|Drama", "serial-killer|detective|korean|slow-burn|true-story", "Two mismatched detectives chase a killer nobody in the system is equipped to catch."],
  ["Train to Busan", 2016, "KO", 7.6, 118, "Yeon Sang-ho", "Horror|Action|Thriller", "zombie|korean|family|tension|survival", "A father and daughter fight to stay alive on a train that is the last safe place in Korea."],
  ["The Handmaiden", 2016, "KO", 8.1, 145, "Park Chan-wook", "Thriller|Romance|Drama", "con-artist|twist|korean|obsession|slow-burn", "A thief poses as a maid to rob a Japanese heiress and finds the plan has other authors."],
  ["Gone Girl", 2014, "HW", 8.1, 149, "David Fincher", "Thriller|Mystery|Drama", "marriage|twist|media|tension|neo-noir", "A wife vanishes on her anniversary and her husband's smile becomes evidence."],
  ["Se7en", 1995, "HW", 8.6, 127, "David Fincher", "Crime|Thriller|Mystery", "serial-killer|detective|dark|neo-noir|twist|rain", "Two detectives track a murderer who is using the seven deadly sins as a schedule."],
  ["Zodiac", 2007, "HW", 7.7, 157, "David Fincher", "Crime|Thriller|Drama", "serial-killer|journalism|obsession|slow-burn|true-story", "A cartoonist becomes the only person who refuses to let an unsolved case go."],
  ["Prisoners", 2013, "HW", 8.1, 153, "Denis Villeneuve", "Crime|Thriller|Drama", "kidnapping|detective|faith|slow-burn|dark", "Two girls vanish and a father decides the law is moving too slowly."],
  ["Nightcrawler", 2014, "HW", 7.8, 117, "Dan Gilroy", "Thriller|Crime|Drama", "media|obsession|neo-noir|dark|character-study", "A freelance crime videographer learns that the worst nights pay the best."],
  ["Sicario", 2015, "HW", 7.6, 121, "Denis Villeneuve", "Thriller|Crime|Action", "cartel|tension|dark|slow-burn|moral", "An idealistic agent joins a task force whose real rules are never written down."],
  ["Heat", 1995, "HW", 8.3, 170, "Michael Mann", "Crime|Action|Thriller", "heist|detective|neo-noir|classic|tension", "A master thief and the detective who understands him circle one last score."],
  ["Goodfellas", 1990, "HW", 8.7, 145, "Martin Scorsese", "Crime|Drama|Biography", "mafia|true-story|classic|voiceover|rise-and-fall", "Thirty years inside the mob, told at the speed of a man who never learned to slow down."],
  ["The Godfather", 1972, "HW", 9.2, 175, "Francis Ford Coppola", "Crime|Drama", "mafia|family|classic|epic|rise-and-fall", "The son who wanted no part of the family business becomes the business."],
  ["Pulp Fiction", 1994, "HW", 8.9, 154, "Quentin Tarantino", "Crime|Drama|Comedy", "nonlinear|dialogue|hitman|classic|cult|dark-comedy", "Hitmen, a boxer and a gangster's wife collide in stories told out of order."],
  ["Reservoir Dogs", 1992, "HW", 8.3, 99, "Quentin Tarantino", "Crime|Thriller|Mystery", "heist|dialogue|nonlinear|cult|tension", "A diamond job goes wrong and the survivors start suspecting each other."],
  ["Inglourious Basterds", 2009, "HW", 8.4, 153, "Quentin Tarantino", "War|Drama|Adventure", "wwii|revenge|dialogue|tension|epic", "A squad of Nazi hunters and a cinema owner plot the same impossible night."],
  ["Django Unchained", 2012, "HW", 8.5, 165, "Quentin Tarantino", "Drama|Western|Action", "revenge|slavery|dialogue|epic|brutal", "A freed man rides into the deep south to buy back his wife from a charming monster."],
  ["Kill Bill", 2003, "HW", 8.2, 111, "Quentin Tarantino", "Action|Crime|Thriller", "revenge|martial-arts|stylized|brutal|strong-female-lead", "A comatose bride wakes up with a list of five names and no intention of stopping."],
  ["No Country for Old Men", 2007, "HW", 8.2, 122, "Joel & Ethan Coen", "Thriller|Crime|Drama", "hitman|fate|slow-burn|tension|neo-noir|dark", "A hunter takes a case of drug money and a quiet killer takes him."],
  ["Fargo", 1996, "HW", 8.1, 98, "Joel & Ethan Coen", "Crime|Drama|Thriller", "kidnapping|dark-comedy|snow|cult|neo-noir", "A car salesman hires two men to kidnap his wife and everything goes politely wrong."],
  ["The Big Lebowski", 1998, "HW", 8.1, 117, "Joel & Ethan Coen", "Comedy|Crime", "slacker|cult|absurd|dark-comedy|classic", "A rug gets ruined and a very relaxed man is dragged into a kidnapping plot."],
  ["The Departed", 2006, "HW", 8.5, 151, "Martin Scorsese", "Crime|Thriller|Drama", "undercover|mafia|twist|tension|boston", "A mole in the police hunts a mole in the mob, and both are very good at their jobs."],
  ["Catch Me If You Can", 2002, "HW", 8.1, 141, "Steven Spielberg", "Biography|Crime|Drama", "con-artist|chase|stylish|true-story|feel-good", "A teenage forger writes cheques as a pilot, a doctor and a lawyer before he can vote."],
  ["Ocean's Eleven", 2001, "HW", 7.7, 116, "Steven Soderbergh", "Crime|Comedy|Thriller", "heist|stylish|ensemble|feel-good|dialogue", "Eleven professionals rob three casinos in the same night for reasons both personal and elegant."],
  ["Knives Out", 2019, "HW", 7.9, 130, "Rian Johnson", "Mystery|Comedy|Crime", "whodunit|ensemble|twist|dark-comedy|fun", "A detective with a strange accent untangles a wealthy family's very tidy murder."],
  ["The Silence of the Lambs", 1991, "HW", 8.6, 118, "Jonathan Demme", "Thriller|Crime|Horror", "serial-killer|detective|psychology|classic|dark|strong-female-lead", "A trainee agent bargains with one monster to catch another."],
  ["The Usual Suspects", 1995, "HW", 8.5, 106, "Bryan Singer", "Crime|Mystery|Thriller", "twist|heist|ensemble|neo-noir|classic", "Five criminals meet in a lineup and one of them is not telling the truth about anything."],
  ["The Lives of Others", 2006, "EU", 8.4, 137, "Florian Henckel von Donnersmarck", "Drama|Thriller", "surveillance|german|slow-burn|emotional|true-story", "A Stasi officer listens to a playwright and slowly defects to the sound of his life."],
  ["Run Lola Run", 1998, "EU", 7.7, 81, "Tom Tykwer", "Thriller|Crime", "time-travel|german|fast|stylized|cult", "A woman has twenty minutes to find 100,000 marks, three times over."],
  ["City of God", 2002, "WO", 8.6, 130, "Fernando Meirelles", "Crime|Drama", "favela|brazil|ensemble|true-story|rise-and-fall|brutal", "Two boys grow up in a Rio housing project, one with a camera and one with a gun."],

  // ---------- Drama ----------
  ["The Shawshank Redemption", 1994, "HW", 9.3, 142, "Frank Darabont", "Drama|Crime", "prison|friendship|hope|classic|emotional|slow-burn", "Two lifers build a friendship and a very long plan inside a corrupt prison."],
  ["Forrest Gump", 1994, "HW", 8.8, 142, "Robert Zemeckis", "Drama|Romance|Comedy", "history|feel-good|love|classic|emotional", "A kind man with no filter drifts through the biggest moments of the century."],
  ["Fight Club", 1999, "HW", 8.8, 139, "David Fincher", "Drama|Thriller", "alter-ego|anarchy|twist|dark|satire|cult", "An insomniac and a soap salesman start a club that gets out of hand."],
  ["American Beauty", 1999, "HW", 8.3, 122, "Sam Mendes", "Drama|Comedy", "suburbia|satire|dark|character-study|classic", "A suburban father wakes up from his life and starts behaving like a stranger."],
  ["Whiplash", 2014, "HW", 8.5, 106, "Damien Chazelle", "Drama|Music", "jazz|obsession|mentor|tension|intense", "A young drummer and a conductor fight over what greatness costs."],
  ["Black Swan", 2010, "HW", 8.0, 108, "Darren Aronofsky", "Drama|Thriller|Horror", "ballet|obsession|surreal|dark|psychological", "A ballerina chasing perfection starts losing the line between rehearsal and hallucination."],
  ["Requiem for a Dream", 2000, "HW", 8.3, 102, "Darren Aronofsky", "Drama|Thriller", "addiction|dark|surreal|brutal|character-study", "Four dreams and four addictions spiral down over one long, loud summer."],
  ["The Shining", 1980, "HW", 8.4, 146, "Stanley Kubrick", "Horror|Drama|Mystery", "madness|isolation|winter|classic|atmospheric|surreal", "A family keeps a mountain hotel open all winter and the hotel keeps them."],
  ["2001: A Space Odyssey", 1968, "HW", 8.3, 149, "Stanley Kubrick", "Sci-Fi|Adventure|Mystery", "space|classic|surreal|mind-bending|slow-burn", "A black monolith nudges humanity forward, and a calm computer disagrees."],
  ["A Clockwork Orange", 1971, "HW", 8.3, 136, "Stanley Kubrick", "Crime|Drama|Sci-Fi", "dystopia|violence|satire|classic|stylized", "The state tries to cure a violent young man by removing his ability to choose."],
  ["Good Will Hunting", 1997, "HW", 8.3, 126, "Gus Van Sant", "Drama|Romance", "genius|mentor|boston|therapy|emotional|feel-good", "A janitor solves impossible maths and refuses to be rescued."],
  ["Dead Poets Society", 1989, "HW", 8.1, 128, "Peter Weir", "Drama|Comedy", "school|mentor|poetry|emotional|classic", "An English teacher tells his students to seize the day and the school disagrees."],
  ["The Green Mile", 1999, "HW", 8.6, 189, "Frank Darabont", "Drama|Fantasy|Crime", "prison|miracle|friendship|emotional|classic", "A death row guard meets an inmate who can heal anything but himself."],
  ["Schindler's List", 1993, "HW", 9.0, 195, "Steven Spielberg", "Biography|Drama|War", "holocaust|wwii|true-story|epic|emotional|black-and-white", "A profiteer keeps hiring Jewish workers until hiring becomes saving."],
  ["Life Is Beautiful", 1997, "EU", 8.6, 116, "Roberto Benigni", "Drama|Comedy|War", "holocaust|italian|family|emotional|classic", "A father turns a concentration camp into a game so his son keeps smiling."],
  ["Cinema Paradiso", 1988, "EU", 8.5, 155, "Giuseppe Tornatore", "Drama|Romance", "cinema|nostalgia|italian|emotional|classic", "A famous director remembers the village projectionist who raised him on movies."],
  ["The Intouchables", 2011, "EU", 8.5, 112, "Olivier Nakache", "Comedy|Drama|Biography", "friendship|french|feel-good|true-story|emotional", "A quadriplegic aristocrat hires the least qualified caregiver in Paris."],
  ["Amadeus", 1984, "HW", 8.4, 160, "Miloš Forman", "Biography|Drama|Music", "classical|jealousy|true-story|epic|obsession", "A court composer is destroyed by his hatred for a giggling genius."],
  ["The Social Network", 2010, "HW", 7.8, 120, "David Fincher", "Biography|Drama", "startup|betrayal|genius|true-story|dialogue|obsession", "A website is invented in a dorm room and the friendship behind it is destroyed."],
  ["Spotlight", 2015, "HW", 8.1, 129, "Tom McCarthy", "Drama|Crime|Biography", "journalism|true-story|boston|slow-burn|investigation", "Four reporters pull a thread that the whole city quietly agreed not to pull."],
  ["12 Angry Men", 1957, "HW", 8.9, 96, "Sidney Lumet", "Drama|Crime", "courtroom|one-location|classic|dialogue|justice", "One juror says not guilty and slowly makes the room earn its verdict."],
  ["La La Land", 2016, "HW", 8.0, 128, "Damien Chazelle", "Romance|Musical|Drama", "jazz|hollywood|bittersweet|colorful|emotional", "A jazz purist and an actress fall in love the same year they start succeeding."],
  ["About Time", 2013, "EU", 7.8, 123, "Richard Curtis", "Romance|Comedy|Sci-Fi", "time-travel|british|family|feel-good|emotional", "A young man uses a family gift to fix his love life and learns the wrong lesson first."],
  ["The Pursuit of Happyness", 2006, "HW", 8.0, 117, "Gabriele Muccino", "Biography|Drama", "homelessness|family|true-story|inspirational|feel-good", "A father with no home and no salary takes an unpaid internship and refuses to lose."],
  ["The Imitation Game", 2014, "EU", 8.0, 114, "Morten Tyldum", "Biography|Drama|Thriller", "wwii|science|true-story|genius|tragic", "The mathematician who broke a code is later broken by the country he saved."],
  ["A Beautiful Mind", 2001, "HW", 8.2, 135, "Ron Howard", "Biography|Drama", "genius|true-story|love|emotional|psychological", "A brilliant mathematician works around his own mind to keep doing mathematics."],
  ["The Sixth Sense", 1999, "HW", 8.2, 107, "M. Night Shyamalan", "Mystery|Thriller|Drama", "ghost|twist|child|atmospheric|classic", "A child psychologist helps a boy who sees things nobody else can."],
  ["Psycho", 1960, "HW", 8.5, 109, "Alfred Hitchcock", "Horror|Thriller|Mystery", "motel|classic|twist|tension|atmospheric", "A woman on the run checks into a motel with a very attached owner."],
  ["Shutter Island", 2010, "HW", 8.2, 138, "Martin Scorsese", "Mystery|Thriller", "twist|asylum|neo-noir|atmospheric|psychological", "Two marshals search an island asylum for a patient who cannot have left."],
  ["Rear Window", 1954, "HW", 8.5, 112, "Alfred Hitchcock", "Mystery|Thriller", "voyeurism|classic|tension|one-location|detective", "A photographer with a broken leg watches his neighbours and sees a crime."],
  ["Amélie", 2001, "EU", 8.3, 122, "Jean-Pierre Jeunet", "Romance|Comedy|Fantasy", "paris|whimsical|french|feel-good|colorful", "A shy waitress rearranges strangers' lives for the pleasure of watching them light up."],
  ["Past Lives", 2023, "HW", 7.8, 105, "Celine Song", "Romance|Drama", "reunion|bittersweet|slow-burn|emotional|identity", "Two childhood friends meet again in New York twenty-four years later."],
  ["Perfect Blue", 1997, "JP", 8.0, 81, "Satoshi Kon", "Animation|Thriller|Mystery", "psychological|japanese|surreal|obsession|mind-bending", "A pop idol becomes an actress and her old self refuses to be replaced."],

  // ---------- Bollywood & Indian ----------
  ["3 Idiots", 2009, "BW", 8.4, 170, "Rajkumar Hirani", "Comedy|Drama", "college|friendship|india|feel-good|emotional|mentor", "Two friends retrace a college friendship built on refusing to be afraid of marks."],
  ["Lagaan", 2001, "BW", 8.1, 224, "Ashutosh Gowariker", "Drama|Sports|Musical", "cricket|colonial|india|epic|underdog", "A village bets its taxes on a cricket match against the rulers who invented the game."],
  ["Dangal", 2016, "BW", 8.3, 161, "Nitesh Tiwari", "Biography|Sports|Drama", "wrestling|family|india|true-story|underdog|inspirational", "A former wrestler trains his daughters to win the medals he never could."],
  ["Gully Boy", 2019, "BW", 7.9, 154, "Zoya Akhtar", "Drama|Music", "rap|mumbai|underdog|india|dreams", "A boy from a Mumbai slum finds his voice in rap and has to choose what to risk."],
  ["Andhadhun", 2018, "BW", 8.2, 139, "Sriram Raghavan", "Crime|Thriller|Comedy", "twist|dark-comedy|india|suspense|obsession", "A blind pianist witnesses a murder and discovers how useful blindness can be."],
  ["Tumbbad", 2018, "BW", 8.2, 104, "Rahi Anil Barve", "Horror|Fantasy|Thriller", "folk-horror|greed|india|atmospheric|rain|dark", "A family guards a buried treasure and the god who guards it back."],
  ["Queen", 2013, "BW", 8.1, 146, "Vikas Bahl", "Drama|Comedy|Adventure", "solo-travel|self-discovery|india|feel-good|friendship", "A jilted bride takes her honeymoon alone and comes back somebody new."],
  ["Zindagi Na Milegi Dobara", 2011, "BW", 8.1, 155, "Zoya Akhtar", "Drama|Adventure|Comedy", "road-trip|friendship|india|feel-good|spain", "Three friends take a road trip through Spain and each faces the fear they packed."],
  ["Barfi!", 2012, "BW", 8.1, 151, "Anurag Basu", "Romance|Comedy|Drama", "love|india|bittersweet|colorful|emotional", "A deaf-mute charmer and two women who love him in very different ways."],
  ["Swades", 2004, "BW", 8.2, 189, "Ashutosh Gowariker", "Drama|Family", "village|india|inspirational|emotional|social", "A NASA engineer returns to his village and finds a harder, slower problem worth solving."],
  ["Rang De Basanti", 2006, "BW", 8.1, 167, "Rakeysh Omprakash Mehra", "Drama|Romance|War", "friendship|patriotism|india|college|emotional", "Five carefree friends make a film about revolution and then need one."],
  ["Chak De! India", 2007, "BW", 8.3, 153, "Shimit Amin", "Sports|Drama", "hockey|underdog|india|team|inspirational", "A disgraced player coaches a women's hockey team nobody wants to fund."],
  ["Munna Bhai M.B.B.S.", 2003, "BW", 8.1, 156, "Rajkumar Hirani", "Comedy|Drama|Romance", "medical|friendship|mumbai|india|feel-good|fun", "A gangster enrolls in medical college and treats patients better than the syllabus."],
  ["PK", 2014, "BW", 8.1, 153, "Rajkumar Hirani", "Comedy|Drama|Sci-Fi", "aliens|satire|india|religion|fun", "An alien stranded in India asks questions adults have stopped asking."],
  ["Udta Punjab", 2016, "BW", 8.1, 155, "Abhishek Chaubey", "Crime|Drama", "drugs|india|dark|brutal|social", "Four lives collide in a state losing a generation to drugs."],
  ["Gangs of Wasseypur", 2012, "BW", 8.2, 321, "Anurag Kashyap", "Crime|Drama|Action", "mafia|india|epic|rise-and-fall|brutal|cult", "Three generations of a coal-belt family settle a feud with increasingly worse ideas."],
  ["Sholay", 1975, "BW", 8.1, 204, "Ramesh Sippy", "Action|Adventure|Drama", "western|friendship|classic|india|cult", "A retired policeman hires two outlaws to end the bandit who took everything."],
  ["Dilwale Dulhania Le Jayenge", 1995, "BW", 8.0, 189, "Aditya Chopra", "Romance|Drama|Family", "love|family|classic|india|feel-good", "Two NRIs fall in love on a Europe trip and then have to win her family."],
  ["The Lunchbox", 2013, "BW", 7.8, 104, "Ritesh Batra", "Romance|Drama", "loneliness|letters|mumbai|india|bittersweet|slow-burn", "A wrongly delivered lunchbox turns into the best conversation either life has had."],
  ["RRR", 2022, "IN", 7.8, 187, "S. S. Rajamouli", "Action|Drama|Fantasy", "epic|bromance|india|spectacle|friendship|stylized", "Two freedom fighters become best friends before they learn what each other does."],
  ["Baahubali: The Beginning", 2015, "IN", 8.0, 159, "S. S. Rajamouli", "Action|Fantasy|Drama", "epic|kingdom|india|spectacle|family", "A boy raised under a waterfall climbs up to find the kingdom that lost his father."],
  ["Drishyam", 2015, "IN", 8.2, 163, "Nishikant Kamat", "Crime|Thriller|Drama", "cover-up|family|india|suspense|twist", "A cable operator builds an alibi for his family that even the police believe."],
  ["Kumbalangi Nights", 2019, "IN", 8.4, 135, "Madhu C. Narayanan", "Drama|Comedy", "family|malayalam|india|feel-good|emotional|slow-burn", "Four brothers with no parents learn to be a household, one small kindness at a time."],
  ["Vada Chennai", 2018, "IN", 8.2, 164, "Vetrimaaran", "Drama|Crime|Action", "tamil|india|gritty|rise-and-fall|epic", "A carrom player is pulled into a war for a neighbourhood he never wanted to rule."],
  ["Super Deluxe", 2019, "IN", 8.3, 176, "Thiagarajan Kumararaja", "Comedy|Drama|Action", "tamil|ensemble|satire|india|mind-bending|dark", "Four stories in one day, tied together by a television nobody should have switched on."],
  ["Kantara", 2022, "IN", 8.2, 148, "Rishab Shetty", "Action|Drama|Fantasy", "kannada|india|folk-horror|revenge|spectacle", "A village performer channels a guardian deity against the men taking its forest."],
  ["'96", 2018, "IN", 8.5, 158, "C. Prem Kumar", "Romance|Drama", "tamil|india|school|bittersweet|emotional|nostalgia", "Two school sweethearts meet at a reunion and quietly count the years."],
  ["Soorarai Pottru", 2020, "IN", 8.3, 153, "Sudha Kongara", "Biography|Drama|Action", "tamil|india|aviation|underdog|inspirational|true-story", "A former air force officer starts an airline for people the market ignores."],

  // ---------- Comedy ----------
  ["The Grand Budapest Hotel", 2014, "HW", 8.1, 99, "Wes Anderson", "Comedy|Adventure|Crime", "whimsical|hotel|heist|stylish|colorful|symmetry", "A concierge and his lobby boy inherit a painting and a great deal of trouble."],
  ["Groundhog Day", 1993, "HW", 8.0, 101, "Harold Ramis", "Comedy|Fantasy|Romance", "time-travel|self-discovery|classic|feel-good|humor", "A rude weatherman repeats the same small town day until he becomes worth liking."],
  ["Office Space", 1999, "HW", 7.7, 89, "Mike Judge", "Comedy|Drama", "corporate|satire|slacker|cult|dark-comedy", "A bored office worker stops caring and accidentally becomes a star employee."],
  ["The Hangover", 2009, "HW", 7.7, 100, "Todd Phillips", "Comedy|Mystery", "vegas|friendship|amnesia|absurd|cult", "Three men wake up after a bachelor party with no groom and no memory."],
  ["Deadpool", 2016, "HW", 8.0, 108, "Tim Miller", "Action|Comedy|Adventure", "superhero|meta|absurd|cult|stylized", "A mercenary with a mouth narrates his own revenge movie and hates the script."],
  ["Scott Pilgrim vs. the World", 2010, "HW", 7.5, 112, "Edgar Wright", "Action|Comedy|Romance", "video-game|stylized|band|cult|fun", "A bassist must defeat his new girlfriend's seven evil exes, arcade rules."],
  ["Hot Fuzz", 2007, "EU", 7.8, 121, "Edgar Wright", "Action|Comedy|Mystery", "british|buddy-cop|genre-mash|cult|fun", "A city supercop is transferred to a village where the murders look like accidents."],
  ["Shaun of the Dead", 2004, "EU", 7.9, 99, "Edgar Wright", "Comedy|Horror", "zombie|british|parody|cult|friendship", "A man tries to win back his girlfriend and save his mum during a zombie outbreak."],
  ["Superbad", 2007, "HW", 7.6, 113, "Greg Mottola", "Comedy", "teen|friendship|cult|absurd|coming-of-age", "Two best friends spend one night trying to be cool before they leave for college."],
  ["Paddington 2", 2017, "EU", 7.8, 103, "Paul King", "Comedy|Family|Adventure", "british|whimsical|feel-good|family|charming", "A polite bear is framed for theft and improves the prison he lands in."],

  // ---------- Animation / Anime ----------
  ["Spirited Away", 2001, "JP", 8.6, 125, "Hayao Miyazaki", "Animation|Fantasy|Adventure", "magical|japanese|beautiful|family|surreal|classic", "A girl must work in a bathhouse for spirits to win back her parents' names."],
  ["Your Name", 2016, "JP", 8.4, 106, "Makoto Shinkai", "Animation|Romance|Fantasy", "body-swap|japanese|time-travel|emotional|beautiful|bittersweet", "Two teenagers start waking up in each other's bodies and then stop."],
  ["A Silent Voice", 2016, "JP", 8.1, 130, "Naoko Yamada", "Animation|Drama|Romance", "bullying|japanese|emotional|redemption|slow-burn|beautiful", "A boy who bullied a deaf classmate spends years trying to apologise properly."],
  ["Princess Mononoke", 1997, "JP", 8.3, 134, "Hayao Miyazaki", "Animation|Fantasy|Adventure", "nature|japanese|epic|surreal|beautiful", "A cursed prince walks into a war between an iron town and the gods of the forest."],
  ["Akira", 1988, "JP", 8.0, 124, "Katsuhiro Otomo", "Animation|Sci-Fi|Action", "cyberpunk|japanese|classic|brutal|mind-bending", "A biker's friend gains a power Neo-Tokyo's army cannot contain."],
  ["Grave of the Fireflies", 1988, "JP", 8.5, 89, "Isao Takahata", "Animation|Drama|War", "wwii|japanese|tragic|emotional|slow-burn", "A brother and sister try to survive the last months of the war together."],
  ["Spider-Man: Into the Spider-Verse", 2018, "HW", 8.4, 117, "Bob Persichetti", "Animation|Action|Adventure", "superhero|multiverse|stylized|feel-good|fun|beautiful", "A teenager learns that anyone can wear the mask, including several other people."],
  ["Toy Story", 1995, "HW", 8.3, 81, "John Lasseter", "Animation|Family|Comedy", "friendship|classic|childhood|feel-good|fun", "A favourite toy meets the new birthday gift and feels his shelf life ending."],
  ["Up", 2009, "HW", 8.3, 96, "Pete Docter", "Animation|Family|Adventure", "adventure|grief|friendship|emotional|feel-good", "A widower ties balloons to his house and accidentally takes a scout with him."],
  ["WALL·E", 2008, "HW", 8.4, 98, "Andrew Stanton", "Animation|Sci-Fi|Family", "robot|environment|space|charming|love|beautiful", "A lonely trash robot finds a plant and follows it across the galaxy."],
  ["Coco", 2017, "HW", 8.4, 105, "Lee Unkrich", "Animation|Family|Music", "mexico|family|music|emotional|beautiful|afterlife", "A boy who wants to play music sneaks into the land of the dead to find his idol."],
  ["Inside Out", 2015, "HW", 8.1, 95, "Pete Docter", "Animation|Family|Comedy", "emotions|growing-up|friendship|emotional|feel-good", "Five feelings run a girl's mind and one of them, Sadness, keeps being useful."],
  ["The Lion King", 1994, "HW", 8.5, 88, "Roger Allers", "Animation|Family|Musical", "africa|classic|family|music|emotional|childhood", "A lion cub runs from a crime he did not commit and must come home to rule."],
  ["Ratatouille", 2007, "HW", 8.1, 111, "Brad Bird", "Animation|Family|Comedy", "cooking|paris|underdog|feel-good|friendship|charming", "A rat with a nose for cooking secretly runs a failing Paris restaurant."],
  ["Klaus", 2019, "EU", 8.1, 96, "Sergio Pablos", "Animation|Family|Comedy", "christmas|friendship|feel-good|whimsical|charming", "A lazy postman starts a small kindness that turns into a legend."],

  // ---------- Horror ----------
  ["Hereditary", 2018, "HW", 7.3, 127, "Ari Aster", "Horror|Mystery|Drama", "family|grief|cult|slow-burn|dark|psychological", "A family funeral starts a chain of events that runs back three generations."],
  ["The Witch", 2015, "HW", 7.0, 92, "Robert Eggers", "Horror|Mystery|Drama", "puritan|folk-horror|slow-burn|atmospheric|dark", "A family alone at the edge of a New England wood is picked off by the wood."],
  ["Get Out", 2017, "HW", 7.7, 104, "Jordan Peele", "Horror|Thriller|Mystery", "race|satire|twist|tension|dark-comedy|psychological", "A weekend with the girlfriend's parents gets strange, then surgical."],
  ["A Quiet Place", 2018, "HW", 7.5, 90, "John Krasinski", "Horror|Thriller|Sci-Fi", "monsters|family|survival|tension|silence", "A family survives by silence while something in the trees listens."],
  ["The Conjuring", 2013, "HW", 7.3, 112, "James Wan", "Horror|Mystery|Thriller", "haunting|cult|based-on-true|tension|jump-scares", "Two paranormal investigators take the case that still keeps their files closed."],
  ["The Ring", 2002, "HW", 7.1, 115, "Gore Verbinski", "Horror|Mystery", "curse|atmospheric|dark|tension|investigation", "A videotape kills its viewers in seven days and a journalist has a copy."],
  ["Alien", 1979, "HW", 8.5, 117, "Ridley Scott", "Horror|Sci-Fi|Thriller", "space|creature|claustrophobic|classic|tension|strong-female-lead", "A cargo crew answers a distress call and brings something back on board."],
  ["The Thing", 1982, "HW", 8.2, 109, "John Carpenter", "Horror|Sci-Fi|Mystery", "isolation|shapeshifter|practical-effects|paranoia|classic|atmospheric", "An Antarctic research team finds a creature that can be any one of them."],
  ["It Follows", 2014, "HW", 6.8, 100, "David Robert Mitchell", "Horror|Thriller", "curse|indie|atmospheric|stylized|tension", "A teenager is followed by something that never runs and never stops."],
  ["The Autopsy of Jane Doe", 2016, "EU", 6.8, 86, "André Øvredal", "Horror|Mystery|Thriller", "coroner|one-location|slow-burn|dark|supernatural", "A father and son pathologist cut open a body neither can explain."],

  // ---------- Romance ----------
  ["Before Sunrise", 1995, "HW", 8.1, 101, "Richard Linklater", "Romance|Drama", "one-night|dialogue|walking|bittersweet|vienna|slow-burn", "Two strangers meet on a train and decide to spend one night talking in Vienna."],
  ["Before Sunset", 2004, "HW", 8.1, 80, "Richard Linklater", "Romance|Drama", "reunion|dialogue|paris|bittersweet|slow-burn", "Nine years later they meet again for one afternoon that has to fit a whole life."],
  ["500 Days of Summer", 2009, "HW", 7.7, 95, "Marc Webb", "Romance|Comedy|Drama", "breakup|nonlinear|indie|bittersweet|feel-good", "A greeting card writer falls for a girl who does not believe in love, out of order."],
  ["Notting Hill", 1999, "EU", 7.2, 124, "Roger Michell", "Romance|Comedy", "london|celebrity|feel-good|charming|british", "A bookshop owner spills orange juice on a movie star and starts a friendship."],
  ["Pride & Prejudice", 2005, "EU", 7.8, 129, "Joe Wright", "Romance|Drama", "period|british|slow-burn|beautiful|classic", "Two proud people take an entire English countryside to admit they like each other."],
  ["The Notebook", 2004, "HW", 7.8, 123, "Nick Cassavetes", "Romance|Drama", "memory|love|tearjerker|bittersweet|emotional", "An old man reads a story to an old woman, one page a day, hoping she remembers."],
  ["Titanic", 1997, "HW", 7.9, 195, "James Cameron", "Romance|Drama|Adventure", "ship|class|epic|tragic|spectacle|love", "Two people from two decks fall in love on a voyage with a fixed ending."],
  ["Call Me by Your Name", 2017, "EU", 7.8, 132, "Luca Guadagnino", "Romance|Drama", "summer|italian|bittersweet|slow-burn|beautiful|coming-of-age", "A teenager falls in love with his family's summer guest in northern Italy."],
  ["Roman Holiday", 1953, "HW", 8.0, 118, "William Wyler", "Romance|Comedy|Drama", "rome|classic|whimsical|bittersweet|charming", "A runaway princess spends a day in Rome pretending to be nobody."],

  // ---------- Fantasy / Adventure / Western ----------
  ["The Lord of the Rings: The Fellowship of the Ring", 2001, "HW", 8.9, 178, "Peter Jackson", "Fantasy|Adventure|Drama", "epic|quest|friendship|middle-earth|classic|beautiful", "Nine walkers set out to destroy a ring before it finds its owner."],
  ["The Lord of the Rings: The Return of the King", 2003, "HW", 9.0, 201, "Peter Jackson", "Fantasy|Adventure|Drama", "epic|battle|friendship|middle-earth|emotional|spectacle", "The last battle for Middle-earth is fought while two friends crawl up a mountain."],
  ["Harry Potter and the Prisoner of Azkaban", 2004, "HW", 7.9, 142, "Alfonso Cuarón", "Fantasy|Adventure|Family", "magic|school|time-travel|friendship|atmospheric|classic", "A prison escapee is coming for Harry, and the truth is far stranger than that."],
  ["Pirates of the Caribbean: The Curse of the Black Pearl", 2003, "HW", 8.1, 143, "Gore Verbinski", "Adventure|Action|Fantasy", "pirates|fun|spectacle|humor|classic", "A blacksmith, a pirate and a governor's daughter chase a cursed crew."],
  ["Raiders of the Lost Ark", 1981, "HW", 8.4, 115, "Steven Spielberg", "Adventure|Action", "archaeology|classic|fun|quest|spectacle", "An archaeologist races the Nazis to a box nobody should open."],
  ["Jurassic Park", 1993, "HW", 8.2, 127, "Steven Spielberg", "Adventure|Sci-Fi|Thriller", "dinosaurs|classic|spectacle|survival|practical-effects", "A billionaire opens the best theme park in the world and forgets the fences."],
  ["The Princess Bride", 1987, "HW", 8.0, 98, "Rob Reiner", "Adventure|Fantasy|Romance", "fairy-tale|witty|cult|fun|classic|feel-good", "A grandfather reads a swashbuckling fairy tale about true love and revenge."],
  ["Pan's Labyrinth", 2006, "EU", 8.2, 118, "Guillermo del Toro", "Fantasy|Drama|War", "fairy-tale|spanish|dark|surreal|beautiful|tragic", "A girl finds a labyrinth in fascist Spain where a faun offers her three tasks."],
  ["The Green Knight", 2021, "HW", 7.0, 130, "David Lowery", "Fantasy|Drama|Adventure", "arthurian|atmospheric|surreal|slow-burn|beautiful", "A knight rides toward a bargain he made with a green giant who cannot die."],
  ["The Good, the Bad and the Ugly", 1966, "EU", 8.8, 161, "Sergio Leone", "Western|Adventure", "western|classic|epic|stylized|quest", "Three gunslingers hunt the same buried fortune across a country at war."],
  ["Once Upon a Time in the West", 1968, "EU", 8.5, 165, "Sergio Leone", "Western|Drama", "western|classic|slow-burn|epic|atmospheric", "A mysterious harmonica player waits for the man who killed his brother."],

  // ---------- Sports / Biography ----------
  ["Rocky", 1976, "HW", 8.1, 120, "John G. Avildsen", "Sports|Drama", "boxing|underdog|classic|inspirational|feel-good", "A club fighter from Philadelphia gets a title shot he is not supposed to survive."],
  ["Ford v Ferrari", 2019, "HW", 8.1, 152, "James Mangold", "Drama|Sports|Biography", "racing|rivalry|true-story|spectacle|underdog", "A car designer and a driver build a machine to beat Ferrari at Le Mans."],
  ["Moneyball", 2011, "HW", 7.6, 133, "Bennett Miller", "Biography|Drama|Sports", "baseball|true-story|underdog|data|feel-good", "A general manager rebuilds a losing team with statistics nobody trusts."],
  ["The Wrestler", 2008, "HW", 7.9, 109, "Darren Aronofsky", "Drama|Sports", "wrestling|character-study|bittersweet|gritty|obsession", "An ageing wrestler takes one more match because it is the only place he exists."],
  ["Warrior", 2011, "HW", 8.1, 140, "Gavin O'Connor", "Drama|Sports|Action", "mma|family|underdog|emotional|brutal", "Two estranged brothers enter the same tournament and meet in the final."],

  // ---------- Musicals / Family / Misc ----------
  ["The Sound of Music", 1965, "HW", 8.1, 172, "Robert Wise", "Musical|Drama|Family", "music|family|classic|feel-good|bittersweet", "A novice nun becomes a governess and turns a strict house into a choir."],
  ["Les Misérables", 2012, "EU", 7.6, 158, "Tom Hooper", "Musical|Drama", "music|period|epic|emotional|classic", "A convict, a lawman and a revolution sing their way through Paris."],
  ["Paddington", 2014, "EU", 7.3, 95, "Paul King", "Comedy|Family|Adventure", "british|whimsical|feel-good|family|charming", "A stowaway bear looks for a home in London and finds a family."],
  ["The Secret Life of Walter Mitty", 2013, "HW", 7.3, 114, "Ben Stiller", "Adventure|Comedy|Drama", "dreams|travel|feel-good|beautiful|self-discovery", "A photo editor stops daydreaming and starts travelling to find a missing negative."],
  ["Into the Wild", 2007, "HW", 8.1, 148, "Sean Penn", "Adventure|Biography|Drama", "road-trip|true-story|nature|philosophical|tragic|feel-good", "A graduate gives away his money and walks into the wilderness to test a theory."],
  ["Cast Away", 2000, "HW", 7.8, 143, "Robert Zemeckis", "Drama|Adventure", "isolation|survival|island|emotional|slow-burn", "A courier survives a crash and spends years negotiating with an island."],

  // ---------- More recent / world ----------
  ["Decision to Leave", 2022, "KO", 7.3, 139, "Park Chan-wook", "Mystery|Romance|Thriller", "detective|korean|slow-burn|obsession|neo-noir|bittersweet", "A detective investigating a widow's death loses the case to his own feelings."],
  ["The Worst Person in the World", 2021, "EU", 7.6, 128, "Joachim Trier", "Romance|Drama|Comedy", "norwegian|coming-of-age|bittersweet|character-study|dialogue", "A woman in her twenties changes careers and lovers looking for a version of herself."],
  ["Portrait of a Lady on Fire", 2019, "EU", 8.1, 122, "Céline Sciamma", "Romance|Drama", "period|french|slow-burn|beautiful|bittersweet|strong-female-lead", "A painter is hired to secretly paint a bride, and the looking becomes mutual."],
  // ---------- extra crowd favourites ----------
  ["Moonlight", 2016, "HW", 7.4, 111, "Barry Jenkins", "Drama|Romance", "identity|coming-of-age|slow-burn|beautiful|emotional|character-study", "A boy grows up in three chapters, each one asking who he is allowed to become."],
  ["Gladiator", 2000, "HW", 8.5, 155, "Ridley Scott", "Action|Drama|Adventure", "revenge|epic|empire|spectacle|classic|brutal", "A betrayed general fights his way up through the arena to reach the emperor."],
  ["Joker", 2019, "HW", 8.4, 122, "Todd Phillips", "Drama|Thriller|Crime", "character-study|dark|villain|society|obsession|dark-comedy", "A failing comedian and a failing city bring out the worst in each other."],
  ["The Batman", 2022, "HW", 7.8, 176, "Matt Reeves", "Action|Crime|Mystery", "detective|neo-noir|dark|atmospheric|villain|slow-burn", "A detective in a bat suit follows a serial killer through a very wet Gotham."],
  ["Avengers: Endgame", 2019, "HW", 8.4, 181, "Anthony & Joe Russo", "Action|Adventure|Sci-Fi", "superhero|time-travel|ensemble|epic|emotional|spectacle", "The surviving heroes bet the whole timeline on one last impossible plan."],
  ["Iron Man", 2008, "HW", 7.9, 126, "Jon Favreau", "Action|Sci-Fi|Adventure", "superhero|origin-story|fun|humor|spectacle", "A weapons dealer builds a suit in a cave and comes home a different man."],
  ["Spider-Man: No Way Home", 2021, "HW", 8.2, 148, "Jon Watts", "Action|Adventure|Sci-Fi", "superhero|multiverse|emotional|spectacle|fun|nostalgia", "A spell gone wrong drags every villain Peter has ever met into his living room."],
  ["Logan", 2017, "HW", 8.1, 137, "James Mangold", "Action|Drama|Sci-Fi", "superhero|father-daughter|grief|brutal|emotional|road-trip", "An exhausted mutant drives a girl across the country to a border that may not exist."],
  ["Skyfall", 2012, "EU", 7.8, 143, "Sam Mendes", "Action|Thriller|Adventure", "spy|revenge|british|spectacle|legacy|villain", "An agent presumed dead comes back to protect the institution that abandoned him."],
  ["Baby Driver", 2017, "EU", 7.5, 113, "Edgar Wright", "Action|Crime|Thriller", "heist|music|stylized|chase|cult|fun", "A getaway driver times every escape to the songs in his headphones."],
  ["1917", 2019, "EU", 8.2, 119, "Sam Mendes", "War|Drama|Thriller", "wwii|survival|one-location|tension|beautiful|spectacle", "Two young soldiers cross a battlefield to stop an attack that will kill 1,600 men."],
  ["Saving Private Ryan", 1998, "HW", 8.6, 169, "Steven Spielberg", "War|Drama|Action", "wwii|survival|brotherhood|brutal|epic|emotional", "A squad walks into occupied France to bring one paratrooper home."],
  ["The Wolf of Wall Street", 2013, "HW", 8.2, 180, "Martin Scorsese", "Biography|Comedy|Crime", "true-story|rise-and-fall|excess|dark-comedy|voiceover|obsession", "A stockbroker builds an empire out of enthusiasm, fraud and very good parties."],
  ["Slumdog Millionaire", 2008, "EU", 8.0, 120, "Danny Boyle", "Drama|Romance", "india|underdog|destiny|true-story|feel-good|bittersweet", "A boy from the slums answers every quiz question because he lived all of them."],
  ["Jab We Met", 2007, "BW", 7.9, 138, "Imtiaz Ali", "Romance|Comedy|Drama", "india|road-trip|love|feel-good|dialogue|fun", "A runaway bride talks a stranger into helping her, then changes his whole decade."],
  ["Dil Chahta Hai", 2001, "BW", 8.1, 183, "Farhan Akhtar", "Drama|Comedy|Romance", "friendship|india|coming-of-age|urban|feel-good|music", "Three friends leave college and discover adulthood is a group project."],
  ["Hera Pheri", 2000, "BW", 8.1, 156, "Priyadarshan", "Comedy|Crime", "india|cult|absurd|friendship|dark-comedy|fun", "Two broke tenants and a gullible landlord answer one very wrong phone call."],
  ["Bajrangi Bhaijaan", 2015, "BW", 8.0, 163, "Kabir Khan", "Drama|Adventure|Comedy", "india|friendship|emotional|road-trip|feel-good|family", "A gentle man walks a lost child across a border that has no interest in kindness."],
  ["Yeh Jawaani Hai Deewani", 2013, "BW", 7.2, 160, "Ayan Mukerji", "Romance|Drama|Comedy", "india|friendship|travel|feel-good|bittersweet|music", "A wedding trip turns four friends into adults whether they planned it or not."],
  ["Tamasha", 2015, "BW", 7.2, 149, "Imtiaz Ali", "Romance|Drama", "india|identity|self-discovery|bittersweet|surreal|music", "A burnt-out salesman remembers the storyteller he was on the other side of the world."],

  // ---------- contemporary Indian popular cinema (added after user feedback) ----------
  ["Rockstar", 2011, "BW", 7.7, 159, "Imtiaz Ali", "Drama|Romance|Music", "music|obsession|rise-and-fall|love|tragic|india", "A dreamer becomes a superstar by turning his heartbreak into songs he can no longer feel."],
  ["Animal", 2023, "BW", 6.1, 201, "Sandeep Reddy Vanga", "Action|Crime|Drama", "father-son|violence|obsession|brutal|family|india", "A son reshapes himself into a weapon to protect a father who never had time for him."],
  ["Andhadhun", 2018, "BW", 8.2, 139, "Sriram Raghavan", "Crime|Thriller|Comedy", "twist|blind|dark-comedy|murder|piano|india", "A blind pianist accidentally witnesses a murder and discovers how badly he can lie."],
  ["Gully Boy", 2019, "BW", 7.9, 154, "Zoya Akhtar", "Drama|Music", "rap|underdog|mumbai|dreams|class|india", "A boy from a Mumbai slum finds his voice in rap and refuses to shrink back into it."],
  ["Barfi!", 2012, "BW", 8.1, 151, "Anurag Basu", "Drama|Romance|Comedy", "charming|feel-good|disability|love|loss|india", "A deaf-mute charmer and an autistic girl build a world that makes more sense than ours."],
  ["Chhichhore", 2019, "BW", 8.3, 143, "Nitesh Tiwari", "Comedy|Drama", "college|friendship|nostalgia|feel-good|hope|india", "A father tells his son about losing at everything that mattered at college."],
  ["Jawan", 2023, "BW", 7.0, 169, "Atlee", "Action|Thriller", "vigilante|revenge|political|spectacle|father-son|india", "A masked vigilante hijacks a metro and exposes a rot that reaches into parliament."],
  ["Pathaan", 2023, "BW", 5.9, 146, "Siddharth Anand", "Action|Thriller", "spy|spectacle|stunts|patriotism|india", "An exiled spy is pulled back in to stop a rogue outfit from burning the border down."],
  ["Stree", 2018, "BW", 7.5, 128, "Amar Kaushik", "Horror|Comedy", "ghost|small-town|humor|curse|india", "A town blames a vengeful spirit for its missing men, and one tailor decides to flirt with her."],
  ["Badhaai Ho", 2018, "BW", 8.0, 124, "Amit Sharma", "Comedy|Drama|Family", "family|feel-good|marriage|society|humor|india", "A grown man's world tilts sideways when his parents announce a surprise baby."],
  ["Masaan", 2015, "BW", 8.1, 109, "Neeraj Ghaywan", "Drama|Romance", "grief|class|varanasi|hope|social|india", "Two strangers in Varanasi carry the dead weight of their families' shame and keep walking."],
  ["Newton", 2017, "BW", 7.7, 106, "Amit Masurkar", "Drama|Comedy", "election|idealism|village|satire|india", "An honest clerk tries to run a free election in a forest village that has stopped believing in them."],
  ["The Lunchbox", 2013, "BW", 7.8, 104, "Ritesh Batra", "Drama|Romance", "letters|loneliness|mumbai|food|hope|india", "A misdelivered lunchbox starts a correspondence between two people who needed someone to talk to."],
  ["Vikram", 2022, "IN", 8.3, 175, "Lokesh Kanagaraj", "Action|Thriller|Crime", "undercover|revenge|cartel|twist|investigation|india", "A black-ops agent hunts a drug syndicate while a mysterious old man dismantles it from inside."],
  ["Kaithi", 2019, "IN", 8.4, 145, "Lokesh Kanagaraj", "Action|Thriller|Crime", "one-night|chase|police|brutal|tense|india", "A released convict just wants to see his daughter, and one night of violence has other plans."],
  ["Asuran", 2019, "IN", 8.4, 141, "Vetrimaaran", "Action|Drama|Crime", "caste|land|revenge|brutal|village|india", "A farmer hides his violent past while his son's death forces the whole caste war into the open."],
  ["Soorarai Pottru", 2020, "IN", 8.4, 153, "Sudha Kongara", "Drama|Biography", "aviation|underdog|inspirational|true-story|india|dreams", "A former airman fights a monopoly to start an airline for people who have never flown."],
  ["Jai Bhim", 2021, "IN", 8.7, 164, "T. J. Gnanavel", "Drama|Crime|Biography", "courtroom|justice|social|true-story|brutal|india", "A lawyer takes on a police force that made a man disappear for asking about his wife."],
  ["Pariyerum Perumal", 2018, "IN", 8.6, 154, "Mari Selvaraj", "Drama|Crime", "caste|college|friendship|social|india|coming-of-age", "A first-generation law student learns exactly how much his caste costs him every single day."],
  ["Ratsasan", 2018, "IN", 8.3, 170, "Ram Kumar", "Thriller|Crime|Mystery", "serial-killer|investigation|dark|twist|police|india", "A cop chasing a child killer realises the profile fits someone standing very close to him."],
  ["96", 2018, "IN", 8.4, 158, "C. Prem Kumar", "Romance|Drama", "school|nostalgia|love|reunion|bittersweet|india", "A school reunion puts two people back in the same room as the teenagers they never stopped being."],
  ["Anbe Sivam", 2003, "IN", 8.6, 160, "Sundar C.", "Drama|Comedy", "road-trip|idealism|friendship|faith|india|feel-good", "A stranded optimist and a cynical ad man argue their way across India about God and kindness."],
  ["Master", 2021, "IN", 7.0, 179, "Lokesh Kanagaraj", "Action|Thriller|Crime", "villain|juvenile|redemption|stylized|india", "An alcoholic professor is sent to a juvenile home run by a gangster with a very long memory."],
  ["Pushpa: The Rise", 2021, "IN", 7.6, 179, "Sukumar", "Action|Crime|Drama", "smuggling|rise-and-fall|underdog|stylized|india", "A coolie claws his way to the top of a red-sandalwood racket and refuses to bow again."],
  ["Arjun Reddy", 2017, "IN", 8.0, 182, "Sandeep Reddy Vanga", "Drama|Romance", "self-destruction|addiction|love|obsession|raw|india", "A brilliant surgeon shreds his own life after a break-up he refuses to accept."],
  ["Jersey", 2019, "IN", 8.5, 157, "Gowtam Tinnanuri", "Drama|Sports", "cricket|father-son|underdog|inspirational|india|tearjerker", "A 36-year-old ex-cricketer tries out for the state team so his son will believe in something."],
  ["Eega", 2012, "IN", 7.7, 134, "S. S. Rajamouli", "Fantasy|Action|Comedy", "reincarnation|revenge|creature|whimsical|spectacle|india", "A murdered man comes back as a housefly and wages an absurdly effective war on his killer."],
  ["Ala Vaikunthapurramuloo", 2020, "IN", 7.2, 165, "Trivikram Srinivas", "Action|Comedy|Drama", "family|identity|feel-good|music|india", "A clerk's son discovers he was swapped at birth with a rich man's heir, and handles it his way."],
  ["Drishyam", 2013, "IN", 8.3, 160, "Jeethu Joseph", "Crime|Thriller|Drama", "cover-up|family|police|smart|twist|india", "A small-town cable operator builds an airtight alibi to protect his family from a powerful father."],
  ["Premam", 2015, "IN", 8.2, 156, "Alphonse Puthren", "Romance|Comedy|Drama", "coming-of-age|love|nostalgia|feel-good|india|college", "Three stages of a man's life, told through the three women he loved at the wrong times."],
  ["Bangalore Days", 2014, "IN", 8.2, 172, "Anjali Menon", "Comedy|Drama|Romance", "cousins|city|friendship|feel-good|family|india", "Three cousins move to Bangalore to chase very different dreams and keep tripping over each other."],
  ["Maheshinte Prathikaaram", 2016, "IN", 8.1, 123, "Dileesh Pothan", "Comedy|Drama", "small-town|revenge|feel-good|photography|india", "A small-town photographer vows to take revenge on the man who humiliated him, then keeps postponing it."],
  ["Lucia", 2013, "IN", 7.9, 135, "Pawan Kumar", "Sci-Fi|Drama|Mystery", "dreams|mind-bending|dream-machine|independent|india", "A cinema usher buys a pill that lets him live his dreams — and someone else starts living his life."],
  ["Sairat", 2016, "IN", 8.3, 174, "Nagraj Manjule", "Romance|Drama", "caste|love|tragic|village|social|india", "Two teenagers from opposite ends of a village caste line run away and find the world outside is worse."],
  ["Tumbbad", 2018, "IN", 8.2, 104, "Rahi Anil Barve", "Horror|Fantasy|Drama", "greed|curse|folklore|atmospheric|period|india", "A family guards a buried treasure guarded by something that only wants to be remembered."],
  ["Super Deluxe", 2019, "IN", 8.3, 176, "Thiagarajan Kumararaja", "Drama|Thriller|Comedy", "nonlinear|ensemble|dark-comedy|faith|india|surreal", "Four stories collide over one chaotic day in Chennai, all of them about people refusing to look away."],
  ["Vada Chennai", 2018, "IN", 8.2, 164, "Vetrimaaran", "Crime|Drama|Action", "gangster|housing|nonlinear|brutal|india", "A carrom player becomes a pawn in a housing board war and slowly learns to play it himself."],

];

/* ---------------------------------------------------------------- synopses
 * Some imported films only ever had a cast list or a credits line as their
 * "description" ("The film stars X and Y."). A card that says that tells you
 * nothing about whether you want to watch the thing, so those films get a line
 * built from their own genres and themes instead — factual, never invented.
 */
const PLOT_WORDS = /\b(follows|tells|centres|centers|revolves|is about|when|story of|chronicles|narrates|after|set in|struggles|attempts|seeks|tries|journey|plot|must|finds)\b/i;
const WEAK_SYNOPSIS = (s) => {
  const t = String(s || "").trim();
  if (!t) return true;
  if (/^(the film |it )?(stars?|starring|features?|marked the debut)/i.test(t)) return true;
  if (/^(a|an) \d{4} .{0,60}film from .{0,40}, directed by/i.test(t)) return true;
  if (/\b(stars?|starring|features?)\b/i.test(t) && t.length < 210) return true;
  // "X is a 2004 Indian Hindi-language film directed and produced by Y" — credits only
  if (/^(\S+ ){1,4}is a \d{4}[^.]{0,90}film\b/i.test(t) && !PLOT_WORDS.test(t) && t.length < 200) return true;
  return false;
};

// words that describe the *market*, not the film
const GENERIC_THEMES = new Set(["india", "indian", "hindi", "bollywood", "hollywood", "tamil", "telugu", "malayalam", "kannada", "film", "cinema"]);

const GENRE_WORD = {
  Action: "action", Adventure: "adventure", Animation: "animated", Biography: "biographical",
  Comedy: "comedy", Crime: "crime", Drama: "drama", Family: "family", Fantasy: "fantasy",
  Horror: "horror", Music: "musical", Musical: "musical", Mystery: "mystery", Romance: "romantic",
  "Sci-Fi": "science-fiction", Sports: "sports", Thriller: "thriller", War: "war", Western: "western",
};

const listPhrase = (items) =>
  items.length <= 1
    ? items[0] || ""
    : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];

const MODIFIER_GENRES = new Set(["romantic", "musical", "animated", "biographical", "science-fiction"]);
const INDUSTRY_PHRASE = {
  Bollywood: "Bollywood",
  Hollywood: "Hollywood",
  "Indian Regional": "Indian regional cinema",
  "European / UK": "European cinema",
  "Japanese & Anime": "Japanese cinema",
  Korean: "Korean cinema",
  "World Cinema": "world cinema",
};

function themedSynopsis(m) {
  const raw = (m.genres || []).slice(0, 2).map((g) => GENRE_WORD[g] || String(g).toLowerCase());
  if (!raw.length) return "";
  // "romantic drama", not "drama romantic"
  const genres = raw.slice().sort((a, b) => (MODIFIER_GENRES.has(b) ? 1 : 0) - (MODIFIER_GENRES.has(a) ? 1 : 0));
  const lead = genres[0];
  const what = genres.length > 1 ? genres.join(" ") : `${genres[0]} film`;
  const where = INDUSTRY_PHRASE[m.industryName] || String(m.industryName || "world cinema").toLowerCase();
  const head = `${/^[aeiou]/.test(lead) ? "An" : "A"} ${what} from ${where}`;
  const by = m.director ? `, directed by ${m.director}` : "";
  const themes = (m.keywords || [])
    .filter((k) => k && k.length > 2 && !GENERIC_THEMES.has(String(k).toLowerCase()))
    .slice(0, 2);
  return themes.length ? `${head}${by} — themes of ${listPhrase(themes)}.` : `${head}${by}.`;
}

const INDUSTRIES = {
  HW: "Hollywood",
  BW: "Bollywood",
  IN: "Indian Regional",
  KO: "Korean",
  JP: "Japanese & Anime",
  EU: "European / UK",
  WO: "World Cinema",
};

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’.:!?,–—]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const CURATED = RAW.filter((row) => row[0] && row[1])
  .map((row) => {
    const [rawTitle, year, industry, rating, runtime, director, genres, keywords, synopsis] = row;
    // "'96" reads badly on a card — trim leading punctuation the same way lookup does
    const title = String(rawTitle).replace(/^[^A-Za-z0-9]+/, "");
    return {
      id: slugify(title) || `movie-${year}`,
      title,
      year,
      industry,
      industryName: INDUSTRIES[industry] || industry,
      rating,
      runtime,
      director,
      genres: genres.split("|"),
      keywords: keywords.split("|"),
      synopsis,
    };
  });

/* ---- imported catalogue (tools/import-wikidata.js) ---------------------------
 * Hand-curated films always win: an import only contributes entries whose id is
 * not already taken. The file is optional so the app still runs without it.
 */
let EXTRA = [];
try {
  EXTRA = require("./movies.extra");
} catch (_) {
  EXTRA = [];
}

const normTitlePre = (t) =>
  String(t || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normTitle = (t) =>
  String(t || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Curated films always win, and a title that is already covered is never imported
// twice — two "Dune: Part Two" cards in one grid is worse than one missing remake.
// The hand-written list itself can contain the same film twice (a title re-added
// later); keep the first spelling and never emit duplicates.
const seenCurated = new Set();
const CURATED_UNIQUE = CURATED.filter((m) => {
  const key = normTitlePre(m.title);
  if (!key || seenCurated.has(key)) return false;
  seenCurated.add(key);
  return true;
});

const curatedTitles = new Set(CURATED_UNIQUE.map((m) => normTitlePre(m.title)));
const seenExtra = new Set();

const movies = CURATED_UNIQUE.concat(
  (Array.isArray(EXTRA) ? EXTRA : []).filter((m) => {
    if (!m || !m.id || !m.title || !m.year || !m.genres || !m.genres.length) return false;
    const key = normTitlePre(m.title);
    if (!key || curatedTitles.has(key) || seenExtra.has(key)) return false;
    seenExtra.add(key);
    return true;
  })
);

// Films whose stored description is a cast list get a themed line instead.
for (const m of movies) {
  if (WEAK_SYNOPSIS(m.synopsis)) {
    const themed = themedSynopsis(m);
    if (themed) m.synopsis = themed;
  }
}

const byId = new Map(movies.map((m) => [m.id, m]));

const ALL_GENRES = [...new Set(movies.flatMap((m) => m.genres))].sort();
const ALL_INDUSTRIES = Object.keys(INDUSTRIES).map((code) => ({ code, name: INDUSTRIES[code] }));

module.exports = { movies, byId, ALL_GENRES, ALL_INDUSTRIES, INDUSTRIES, slugify };
