--
-- PostgreSQL database dump
--

-- Dumped from database version 15.13 (Debian 15.13-1.pgdg120+1)
-- Dumped by pg_dump version 15.13 (Debian 15.13-1.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: habit_frequency_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.habit_frequency_enum AS ENUM (
    'daily',
    'weekly',
    'monthly'
);


ALTER TYPE public.habit_frequency_enum OWNER TO postgres;

--
-- Name: task_priority_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.task_priority_enum AS ENUM (
    '1',
    '2',
    '3'
);


ALTER TYPE public.task_priority_enum OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: habit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.habit (
    id integer NOT NULL,
    name character varying NOT NULL,
    description character varying,
    intent character varying,
    affirmation character varying,
    color character varying DEFAULT 'cyan'::character varying NOT NULL,
    icon character varying,
    frequency public.habit_frequency_enum DEFAULT 'daily'::public.habit_frequency_enum NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "originNoteId" integer,
    "userId" integer
);


ALTER TABLE public.habit OWNER TO postgres;

--
-- Name: habit_check; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.habit_check (
    id integer NOT NULL,
    date date NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "habitId" integer
);


ALTER TABLE public.habit_check OWNER TO postgres;

--
-- Name: habit_check_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.habit_check_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.habit_check_id_seq OWNER TO postgres;

--
-- Name: habit_check_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.habit_check_id_seq OWNED BY public.habit_check.id;


--
-- Name: habit_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.habit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.habit_id_seq OWNER TO postgres;

--
-- Name: habit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.habit_id_seq OWNED BY public.habit.id;


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


ALTER TABLE public.migrations OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.migrations_id_seq OWNER TO postgres;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: note_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.note_tags (
    "tagsId" integer NOT NULL,
    "notesId" integer NOT NULL
);


ALTER TABLE public.note_tags OWNER TO postgres;

--
-- Name: notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notes (
    id integer NOT NULL,
    title character varying NOT NULL,
    content text NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "isPinned" boolean DEFAULT false NOT NULL,
    "isArchived" boolean DEFAULT false NOT NULL,
    "userId" integer
);


ALTER TABLE public.notes OWNER TO postgres;

--
-- Name: notes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.notes_id_seq OWNER TO postgres;

--
-- Name: notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notes_id_seq OWNED BY public.notes.id;


--
-- Name: tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tags (
    id integer NOT NULL,
    name character varying NOT NULL,
    color character varying,
    "userId" integer
);


ALTER TABLE public.tags OWNER TO postgres;

--
-- Name: tags_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tags_id_seq OWNER TO postgres;

--
-- Name: tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tags_id_seq OWNED BY public.tags.id;


--
-- Name: task; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task (
    id integer NOT NULL,
    title character varying NOT NULL,
    description character varying,
    "isComplete" boolean DEFAULT false NOT NULL,
    "isArchived" boolean DEFAULT false NOT NULL,
    priority public.task_priority_enum DEFAULT '2'::public.task_priority_enum NOT NULL,
    "dueDate" timestamp without time zone,
    "completedAt" timestamp without time zone,
    "archivedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" integer NOT NULL
);


ALTER TABLE public.task OWNER TO postgres;

--
-- Name: task_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.task_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.task_id_seq OWNER TO postgres;

--
-- Name: task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.task_id_seq OWNED BY public.task.id;


--
-- Name: task_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_tags (
    "taskId" integer NOT NULL,
    "tagsId" integer NOT NULL
);


ALTER TABLE public.task_tags OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying NOT NULL,
    email character varying NOT NULL,
    password character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: habit id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.habit ALTER COLUMN id SET DEFAULT nextval('public.habit_id_seq'::regclass);


--
-- Name: habit_check id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.habit_check ALTER COLUMN id SET DEFAULT nextval('public.habit_check_id_seq'::regclass);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: notes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notes ALTER COLUMN id SET DEFAULT nextval('public.notes_id_seq'::regclass);


--
-- Name: tags id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tags ALTER COLUMN id SET DEFAULT nextval('public.tags_id_seq'::regclass);


--
-- Name: task id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task ALTER COLUMN id SET DEFAULT nextval('public.task_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: habit; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.habit (id, name, description, intent, affirmation, color, icon, frequency, "isActive", "createdAt", "updatedAt", "originNoteId", "userId") FROM stdin;
1	Development Mastery	Practices that enhance or improve current programming, designing, or architecting proficiency as it pertains to development. 	This will make me a more sought after programmer and engineer. I will be able to create cool technologies to support my other passions as well as myself financially. 	I will become a master engineer, programmer, and developer. 	emerald	target	daily	t	2025-05-29 21:38:11.828342	2025-05-29 21:38:11.828342	\N	1
3	test	test	test	test	cyan	book	daily	t	2025-05-29 21:52:14.865499	2025-05-29 21:52:14.865499	\N	5
4	drink watur		health	May this watur heal me	blue	droplet	daily	t	2025-06-03 14:53:12.22453	2025-06-03 14:53:12.22453	\N	4
5	Composition Mastery	Focuses on cultivating musical aptitude both by listening and composing music. Skills include arrangement, voicing, mixing, and the application of music theory and one's own musical intuition. 	Music is a universal language and one capable of communicating depths of experience in a truly impacting and immersing manner. Creation of music is one of the many gifts of consciousness. 	"I am a brilliant composer of mythical proportions. I will excel in music composition and bring glorious sounds to the worlds."	blue	star	daily	t	2025-06-10 21:19:44.34475	2025-06-10 21:19:44.34475	\N	1
6	Fitness Mastery	Practices which exercise the body to maintain the health and wellbeing of the practitioner. Skills include Yoga, Workouts, Aerobic Exercises, Weight lifting, running, swimming, climbing, cycling, and much more.	To hone one's body and expand one's physical limitations is an important part of an enlightened mage's quest. Discipline in this practices have extremely beneficial returns while the mage engages in the physical world. DO NOT NEGLET THIS. 	I shall care for my body as it is my temple. Without it, I could not partake in the wonders of the physical plane. I love my body and to honor it I shall keep it strong and healthy. 	rose	heart	daily	t	2025-06-10 21:25:12.957416	2025-06-10 21:25:12.957416	\N	1
\.


--
-- Data for Name: habit_check; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.habit_check (id, date, "createdAt", "habitId") FROM stdin;
24	2025-06-03	2025-06-03 14:53:19.725862	4
25	2025-06-03	2025-06-03 14:53:20.754773	4
26	2025-06-03	2025-06-03 14:53:21.567387	4
27	2025-06-11	2025-06-10 21:15:28.577695	1
28	2025-06-11	2025-06-10 21:19:51.31375	5
29	2025-06-22	2025-06-22 02:53:44.895351	5
30	2025-06-22	2025-06-22 02:53:49.711521	1
31	2025-06-22	2025-06-22 02:53:52.085816	1
32	2025-06-22	2025-06-22 02:53:57.499085	6
33	2025-06-22	2025-06-22 02:53:58.816216	6
34	2025-06-24	2025-06-24 16:53:37.540357	1
35	2025-06-24	2025-06-24 16:53:41.497289	5
36	2025-06-24	2025-06-24 16:53:44.285958	6
37	2025-06-27	2025-06-26 23:15:36.689444	1
38	2025-06-27	2025-06-26 23:15:40.034894	6
39	2025-06-30	2025-06-30 19:41:32.196689	1
40	2025-07-22	2025-07-21 21:25:53.431469	1
41	2025-07-22	2025-07-21 21:25:56.446518	5
42	2025-07-22	2025-07-21 21:26:05.922144	6
43	2025-07-22	2025-07-21 21:26:06.760238	6
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.migrations (id, "timestamp", name) FROM stdin;
1	1742014225316	InitialMigration1742014225316
2	1742069663536	AddUserTable1742069663536
4	1745978793483	AddColorToTags1745978793483
5	1745978842464	AddColorToTags1745978842464
6	1746334020490	AddUserToTags1746334020490
7	1747190464820	AddHabitsModule1747190464820
8	1747965253859	AddHabitNoteLinkAndFrequency1747965253859
9	1748568785571	AddHabitWithUserRelation1748568785571
11	1753236681927	TaskMigration1753236681927
12	1753310586900	FixTaskTagsTableName1753310586900
13	1753316936942	WhateverNameYouWant1753316936942
14	1753322497328	AddUserIdColumnToTask1753322497328
\.


--
-- Data for Name: note_tags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.note_tags ("tagsId", "notesId") FROM stdin;
6	2
11	3
9	3
8	4
7	4
12	5
13	5
18	5
17	5
14	5
15	5
21	6
19	6
20	6
22	6
23	7
6	8
7	8
25	20
26	21
27	22
26	22
6	23
7	23
6	24
7	24
11	25
9	25
28	25
28	3
28	4
11	26
28	26
9	26
27	27
28	28
29	28
11	29
28	29
30	29
29	30
6	31
6	32
11	32
28	32
6	33
7	33
6	34
6	35
8	35
28	35
9	35
\.


--
-- Data for Name: notes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notes (id, title, content, "createdAt", "updatedAt", "isPinned", "isArchived", "userId") FROM stdin;
2	5/4/2025 ~ Notes App MVP 	Now in it's completion as a standalone note taking application and stage one of the full MVP. \nCurrently the note app has authentication so users can sign-up, login, logout and data permanence with database integration. \nThere is tag support with tags persisting across sessions and account bound to the users. \nWe have a basic navbar which need more spice and possibly more intelligent design as the navigation does not feel quite natural as it stands. \n\nAi module is in development and represents the final stretch of the application. We still want to also do UI/UX cleanup jobs and possibly add some features like checklists, bullet point support and other general quality of life updates to the notes. \n\nFinally a known bug remains which has to do with tag updates. Currently we are not able to save an update, we get an error. Should be a simple fix though. \n\n-Varuna	2025-05-04 02:22:17.90317	2025-05-04 02:22:17.90317	f	f	1
3	35 And Thriving	Here's a brief update: \nI am 35, \nI am one of four founders of a technology startup soon to be successful called Qbon. \nI am about done with an ai enhanced note taking app that's entirely mine. \nI am about to start college again. \nI am deeply versed in magic, philosophy, research, music, and much more. \nI am well rounded, intelligent, and wise well beyond many lifetimes. \nAnd much more greatness still, however I am not without my flaws either. \nI need to get back in shape! \nI need to work on discipline and will! \nI need to really focus and lock in to reach my full potential. \n\n-Varuna	2025-05-04 02:26:14.203928	2025-05-04 02:26:14.203928	f	f	1
4	Current Studies	Currently we're interested in quantum physics, automation, and AI. \nPhilosophically we're satisfied in a collection of ideas we find align with our experience and vision. \nSpiritually we are still trying to integrate our non-dual and dual selves. \nMore on this later. 	2025-05-04 02:28:31.059031	2025-05-04 02:28:31.059031	f	f	1
5	Test 01	A simple test featuring everything. 	2025-05-04 02:30:50.453478	2025-05-04 02:30:50.453478	f	f	2
6	sdfsdfs	sdfsdfsdf	2025-05-04 02:42:09.676698	2025-05-04 02:42:09.676698	f	f	3
7	Eternal Strands	A great game especially for mobility and environmental reactions to spell work. Highly recommended at discounted price points. \nBoss fights are outstanding and each introduce a new and interesting mechanic. \nCrafting is mid at best, but still enjoyable as a system.  Music is excellent though a little scarce and the story is hardly memorable or engaging. \nQuest are mid as well. But it all kinda works because of beautiful vistas, excellent character mobility, and a fun battle system tying it all together. \n\n7/10	2025-05-04 14:39:57.035716	2025-05-04 14:39:57.035716	f	f	1
8	5/9/2025 - Ai Notes MVP Update	We have successfully added a time out feature for security purposes. The user's JWT token will expire within an hour. Upon doing so, a toast element will come up to alert the user and redirect back to login in 3 seconds.  The MVP is now completed and fully functional and secure, now we need to add a few modules still to fulfil it's true goal of becoming ai enabled. \n\nNext we will add a habits module to track user habits and add another layer of usability to the application. For now, we rest. \n\n\nps. Ok for tomorrow we'll take care of paginating notes as currently the component can only hold up to six notes safely. 	2025-05-09 21:44:21.757535	2025-05-09 21:49:00.956376	f	f	1
20	Oooo	Okkkkk	2025-05-10 18:32:15.780602	2025-05-10 18:32:15.780602	f	f	4
21	Bull	SHIT.\nThe audacity.	2025-05-10 18:32:32.795852	2025-05-10 18:32:32.795852	f	f	4
22	*sigh*	mannnn...	2025-05-10 18:32:58.191225	2025-05-10 18:32:58.191225	f	f	4
23	5/10/2025 Ai Notes MVP	Today we overhauled notes/page to include pagination and tag sorting. We also expanded the notes pad to take up most of the screen allowing for deeper immersion and better distribution of notes.  The app is looking excellent and at this stage there is no known errors or bugs needing patching.  Ai Notes is fully stable and now can be safely release as a full featured secured app. Despite this, the app still has a few features I'd like to include before release. Namely:\n-Ai Module (Central to the apps identity and core feature of the application)\n-Notes customization (Allowing users to make their notes more customizable including bullet points, check boxes, font and text formatting etc.) \n	2025-05-10 18:57:36.287546	2025-05-10 18:57:36.287546	f	f	1
24	5/15/2025 Ai Notes - MVP	The project keeps expanding in a good way, but new features creep up and the scope of the mvp expands with it. \nCurrently as of today, we added the habit tracking features. Habits module in it's current state allows for the creation of new habits, the checking in, update and deletion of existing habits. Currently we have two pages that belong to the habits module front end. We have a page that displays all habits and one that displays individual habits which I'm thinking of removing right now. \n\nEventually this feature should be a major part of the application and be treated like contracts to self.  For now, it's a working prototype. \n\n-Varuna	2025-05-15 02:04:09.963227	2025-05-15 02:04:09.963227	f	f	1
25	5-23-2025 Time...	Time passes swiftly in measured days. Moments become precious and regrets more apparent. One must find joy in what one has and identify what are the things that truly matter.  I am now half way through 35 and it's scary to think about age. Realizations come and one is left to process them. We are resilient creatures, some of us are somewhat super. Incredible beings with command over will and the energy of a thousand suns. \n\nI don't know where I fall in these imaginary scales, but I do recognize there's a humility in aging.  I may not be my younger self any longer but this synthesized form is giving way to something truly beautiful. Despite the bad and the ugly there is some good and wonderful worth protecting. \n\nI hope in time that my proud moments outweigh my regrets, and that when the time comes to say farewell to this epic, that I am happy and fulfilled with the life I've lived.  It's a terrifying look at the other side of life, but if it must come for me as it has done to so many others, then I hope I can take my leave with grace. \n\nHere's to all our ancestors, those who already passed this threshold and watch over us in the great beyond. 	2025-05-23 14:09:56.96121	2025-05-23 14:09:56.96121	f	f	1
33	06/26/2025 ~ AI Notes Progress	I just completed the first version of the ai module and successfully connected to open ai using the cheapest models which is more than enough to begin with. So far the app is coming along really nicely and should be available for the first beta testing round as well as publication into the portfolio. \n\nWe're behind schedule and there are many pieces still missing; Mood tracking, Calendar, Metrics, Notes Formatting, overall formatting, ui over-haul and documentation just to name a few. \n\nBut we ought to be very proud we have a hell of a product here that is actually monetizable. Let's keep improving and evolving the product. 	2025-06-26 23:15:26.576612	2025-06-26 23:15:26.576612	f	f	1
34	06/30/2025 ~ AI Notes State Update	I've added chronology to notes. Now, notes denote when they where written automatically they are also sorted into descending chronology so newer notes are at the top. \nWe also added a note counter under the tag sorting column, this gives the user a sense of progression but it may be removed in favor of a more complete metrics module.  Finally this update adds a little flare when the user does not have any notes yet, this was lazily handled previously with just a generic message. 	2025-06-30 19:40:20.169956	2025-06-30 19:40:20.169956	f	f	1
26	5-29-2025 State of Self	I feel like I'm under preforming at work, school, and life generally. I have this form looming over me I still haven't filled, no exercising, no progress in code, it feels like i'm stagnating. I haven't loss sight of my ambitions and I'm not giving up, but im tired, battle worn, and could really use a few wins. Money would be great, but I must confess that I am now 35 and in a far better place than I have ever been when it comes to money. \n\nI just need to be making more so I can live the way I want to live. I'm still smoking a ton, well it's not really all that much but it's a lot. 4-6 bowls a day. Granted it's a small bowl. I begin to think about long term effect of things and am weary about my age too. \n\nI think, it's important to mention that I feel a general lack of motivation for much. The future feels dimmed and I'm not sure why. Maybe my inner critic is at it again or maybe I let myself down thus far. \n\nLet's do a quick pivot and end in a good note. \n\nI am in a 10 and a half year old romantic relationship which may lead to marriage and potentially much more. I am one of four founders in a tech company (although I do feel like I am carried heavily by brian). I have coding skills that may not be top notch but they aren't bad either.  I have musical equipment that my younger self would've loved by I am down on my creative ability. I feel like im just not good enough. \nThere is hurt there that not only clouds my creativity but actively blocks it and misguides it. \n\nMy voice hasn't gotten any stronger but I am seeing a therapist Cindy, who is helping me with that and other obstacles I face. My family relationship is strong, though I still feel like I fail my dad too often. Like I'm never there for him when he needs me anymore. So much so that he's stopped asking and I am not making an effort to mend that. Time passes and I barely notice. I wonder how he feels about it, I wonder if he feels his limited time more than me and longs to spend that time with me... \n\nI wonder how much of this dynamic plays into him wanting to move away? \n\nAnyway, there is a looming sadness here mid 35. I am not entirely sure where it arises from but it is certainly there. \nI am in need of a new alignment. A new way to center and return to myself... \n\nPerhaps, another journey down yoga to reawaken the Yogini in me. \n\nThat's all for now. Another reflection for you varu, the future that inevitably comes. You'll be slightly or totally different when you read this, I love you. I all that came before you and is coming after.  	2025-05-29 18:43:58.497227	2025-05-29 18:43:58.497227	f	f	1
27	tired	yes	2025-06-03 14:51:28.26891	2025-06-03 14:51:28.26891	f	f	4
28	6/10/2025 ~ Cinematic Rebirth	I am currently working on a new piece of music that represents a milestone since my return to composition. Ever since I decided to write again I've been struggling with creating content that represents my talent. This piece is shaping up to be that re-kindling with music -- A much needed motivational boost to my productions. \n\nThe song features a cinematic build up to an action exposition. Currently only the song's opening is built. It features woodwinds, a solo cello, orchestral strings, ostinato strings, and deep thematic depth. I don't know where the song will go from it's current state but it certainly has great potential. 	2025-06-10 21:14:38.981605	2025-06-10 21:14:38.981605	f	f	1
29	State Of Mind ~ 06.10.25 	This week I felt relatively well, I kept busy I had to help both parents and sister so time flew. Had two meetings with Sysco for qbon and both went exceptionally well. We're looking really good there and it seems we may explode soon. I started composing a new song and it's sounding lovely for only two sessions. This app is trully a gem to be proud of, I need to honor it and push towards it's completion. \n\nCarina and I are doing great, we still have our issues but we handle them with grace and attention to ensure both of us are well. I reached out to Cass recently and opened up about how important she is to me as a historic friend and like minded peer. Few people I can connect as deeply in our mental maturity. \n\nMark is kinda dropping off on his own and it seems like that relationship grows more and more distant as time passes. It's true I don't make much of an effort and the fact of his political ideologies really disturbs me. Sarah I miss, our friendship is also being submitted to distance and on this end it feels like either party is helpless to make the time to see the other. Locational interests don't match either so it becomes difficult. \n\nNico is always as close as he is. Kristian is harder to see nowadays given he is a dad, but I also don't make much of an effort there. \n\nAnyway things are good and I think the future looks bright. I am slightly concerned about the tensions growing politically and also socially.  But I try not to engage too much with that poison. I will keep my attention on what I can control and what I want to build and become. 	2025-06-10 21:37:18.990128	2025-06-10 21:37:18.990128	f	f	1
30	06/22/2025 Cinematic Rebirth Master	I have mastered and mixed cinematic rebirth song is approximately 25% completed. Currently the song features three sections, or really two sections. An introductory A section and a riveting B sections with action strings and soloists. I need to create a bridge to a C section and then the section itself.  At this stage I believe the song will be a four section song C being the interlude to the closing D section. \n\nCurrent evaluation:\n\nSolos: Cello, Flute, Clarinet\n  flutes could be slightly louder than they currently are. \n  cello seats right where it should but we need to really enhance the glides for dramatic effect. \n\nStrings: Albion ONE is a high range contrabass, Legion Strings as the low register contrabass, action strings for ostinato rhythms.\n  Albion one is in it's proper space it seems. Maybe a little loud but I think it's ok. \n  Action strings needs programing and dynamic work. Perhaps a peak compressor. A little repetitive Maybe change pattern slightly. \n  Contrabass is perfect for the intro but gets relatively low as Albion overtakes it's space. Need some balance here. \n\nBrass: Detail Albion One. Need more brass. \nCurrently it's just a simple disharmonic detail for interest. \n\nSound imaging is pretty good right now, and spatial imaging also. Mastering is also started and pretty advanced at this stage. \nI would say song is coming along pretty nicely. \n	2025-06-22 02:48:58.187643	2025-06-22 02:48:58.187643	f	f	1
31	Needed Features	We need to sort notes automatically by date in descending order. So newer notes always appear first in the list. \nWe also need to be able to hit habit completion toggle from the overview habits page. \nWe need to add a simple habit creation option for when users don't want to forge an entire contract. \nStill need metrics.\nStill need mood tracking.\nStill need ai features. \nStill need notes overhaul. \n\nFinally we need to close out with dist and host. \nBut we're getting there. 	2025-06-22 02:53:19.929752	2025-06-22 02:53:19.929752	f	f	1
32	Personal Assessment Overview - 06/24/2025	As of today I am reviewing my overall assessment for how I'm doing, what is going well, what is going not so well, where I need to improve, and where I am excelling.  \n\nFirst of all, there is a dire need to hone in my online presence. Currently it's scattered completely neglected and hardly used at all. I need to at least maintain a clean LinkedIn image. \n\nSecondly, portfolio needs to be expedited. Currently it features Qbon, Ai Notes, and basically that's all. My resume features my work with Cygna with CPP, Insidely, and the short-lived market Plus.  As well as my work with Qbon, and my own personal works like the AI notes. \n\nNow, on to other things that need serious improvement. My administrative life and my financial life need to be in order. Currently I'm seriously struggling. I need to learn about financial advisers and if I can benefit from their use. I need to get my financial aid for school in order also. Finally my health insurance needs to be taken care of as well. \n\nThose areas enumerated above are the places I need the most work on. Another important are is my networking, socializing, talking skills and predispositions. These need to be improved if I am to reach my highest potential and achieve any recognition at all. \n\nBeyond this I need to complete and put out my portfolio and get myself out there so I can increase my income. Currently I am risking too much with Qbon as far as time goes and potential for return.  I believe in the product but I am basically financially starved. I need help to improve this aspects. \n\nI also want to engage on a gym membership and some personal training. Fitness is so important and I can't neglect it at this age or really any age. It's an important investment. \n\nMarriage also needs to be considered and planned for. Time is escaping my grasp and if I want this to happen I need to act. \n\nMy music should find a monetary outlet too, perhaps I should invest sometime into licensing again. \n\nAlas, that is all I can think of for now but these are very important areas to consider and work towards improving. 	2025-06-24 16:53:19.135537	2025-06-24 16:53:19.135537	f	f	1
35	State of Ai Notes MVP	I decided to remove the ai feature and the familiars as it stood in the way of a more consize experience for the user. \nThis is meant to be an extension of one's cognition and the familiar system was gamifying it into something silly and out of focus. \n\nHaving done so I now endeavor to do an application wide update and refactor to ensure the ai module comes in as it should\nwith all the relationships baked in from the start. \n\nBefore adding ai functionality we'll also be adding a mood module, a calendar module and a tasks module. These will also be intertwined and work in synergy across the application. \n\nFinally the ai layer will connect all these features in deeply meaningful ways that will be an aid to the users in organizing their cognition fully. \n\nAs of now, we've also created the intial confluence documentation with the current architecture. \nWe'll have to update this once the app is complete but for now it's pretty lovely. \n\nWe also need to start thinking about our website. \nThis will be a pivotal piece of our success. 	2025-07-21 21:25:16.176483	2025-07-21 21:25:16.176483	f	f	1
\.


--
-- Data for Name: tags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tags (id, name, color, "userId") FROM stdin;
6	Development	cyan	1
7	Research	violet	1
8	Magick	slate	1
9	Spirituality	emerald	1
10	Travel	amber	1
11	Health	rose	1
13	Ember Test	rose	2
14	Whisper Test	slate	2
15	Pulse Test	violet	2
17	Verdant Test	emerald	2
18	Sunwake Test	amber	2
12	Astral Test	cyan	2
21	{(_)}	rose	3
20	nl;oweuin;oinv;woeinv;oaiwkn;oitjf;a20o39875029375-0qp23i4uhphj9875pf3j27q028750hnvg	rose	3
19	Just a quick 	emerald	3
22	Some Tag	amber	3
23	Gaming	violet	1
25	Test 1	cyan	4
26	Bullshit	rose	4
27	UGhhhh	violet	4
28	Mind	slate	1
29	Music	cyan	1
30	Work	rose	1
\.


--
-- Data for Name: task; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.task (id, title, description, "isComplete", "isArchived", priority, "dueDate", "completedAt", "archivedAt", "createdAt", "updatedAt", "userId") FROM stdin;
8	archived test	Scope out backend and AI format options	f	f	3	2025-08-01 16:00:00	\N	\N	2025-07-23 22:17:34.3308	2025-07-23 22:19:55.270378	1
6	Test writing AI module docs	Scope out backend and AI format options	f	f	3	2025-08-01 16:00:00	\N	\N	2025-07-23 20:30:54.183077	2025-07-23 22:22:26.153902	1
\.


--
-- Data for Name: task_tags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.task_tags ("taskId", "tagsId") FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, email, password, "createdAt", "updatedAt") FROM stdin;
1	Varuna	Varunanda.creative@gmail.com	$2b$10$8sKBhXyBfOIiZaQceeFIo.U0nzpUhA65QZPVv9T6eLtA2RMZLFAUG	2025-05-04 01:47:08.34769	2025-05-04 01:47:08.34769
2	Tester01	1@2.com	$2b$10$niWuzeOt1OqdCsmfVNadsOxKVNd2QLgKaXc4NXFDR3OiK8XBfsI4i	2025-05-04 02:29:09.847671	2025-05-04 02:29:09.847671
3	Tester02	2@1.com	$2b$10$s8L9DRStFNc7mLWZgLswPue52M7yhn64cLOAF5bdmpY.ssr/cnPQa	2025-05-04 02:36:30.036729	2025-05-04 02:36:30.036729
4	aria	kinomi01@live.com	$2b$10$5Ua66r0M0crLy4I8lDaeHuli8H9DtCgZfWn0PNAXVaunnwg8qxupy	2025-05-10 18:30:55.82799	2025-05-10 18:30:55.82799
5	Test01	ts@a.com	$2b$10$5X7lVWVmF0fycYliaI3V0OsnXVmNq3AQeL3q.q8HIZBd1lCrh1fBu	2025-05-29 21:51:59.640818	2025-05-29 21:51:59.640818
6	testuser	testuser@example.com	$2b$10$B7v3za8Y4jnaffjbhLqjX.h3TPjEHmopKT7.F2d8JRzylBoATYPW2	2025-07-06 00:11:30.021154	2025-07-06 00:11:30.021154
\.


--
-- Name: habit_check_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.habit_check_id_seq', 43, true);


--
-- Name: habit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.habit_id_seq', 6, true);


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.migrations_id_seq', 14, true);


--
-- Name: notes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notes_id_seq', 35, true);


--
-- Name: tags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tags_id_seq', 30, true);


--
-- Name: task_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.task_id_seq', 8, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 6, true);


--
-- Name: task_tags PK_3164b85e5615433116e92980767; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT "PK_3164b85e5615433116e92980767" PRIMARY KEY ("taskId", "tagsId");


--
-- Name: habit PK_71654d5d0512043db43bac9abfc; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.habit
    ADD CONSTRAINT "PK_71654d5d0512043db43bac9abfc" PRIMARY KEY (id);


--
-- Name: note_tags PK_887b9dafa0f1b3f51393444ec02; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.note_tags
    ADD CONSTRAINT "PK_887b9dafa0f1b3f51393444ec02" PRIMARY KEY ("tagsId", "notesId");


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: notes PK_af6206538ea96c4e77e9f400c3d; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT "PK_af6206538ea96c4e77e9f400c3d" PRIMARY KEY (id);


--
-- Name: habit_check PK_afecf9072f2b75881ca508a3bb1; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.habit_check
    ADD CONSTRAINT "PK_afecf9072f2b75881ca508a3bb1" PRIMARY KEY (id);


--
-- Name: tags PK_e7dc17249a1148a1970748eda99; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY (id);


--
-- Name: task PK_fb213f79ee45060ba925ecd576e; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT "PK_fb213f79ee45060ba925ecd576e" PRIMARY KEY (id);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: tags UQ_d90243459a697eadb8ad56e9092; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "UQ_d90243459a697eadb8ad56e9092" UNIQUE (name);


--
-- Name: IDX_1470ad368e79cb5636163a4bf8; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_1470ad368e79cb5636163a4bf8" ON public.task_tags USING btree ("taskId");


--
-- Name: IDX_48eb33cd7ddfa7ca9c5dbaff6b; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_48eb33cd7ddfa7ca9c5dbaff6b" ON public.note_tags USING btree ("notesId");


--
-- Name: IDX_858daeb22a80374e11b779fc72; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_858daeb22a80374e11b779fc72" ON public.task_tags USING btree ("tagsId");


--
-- Name: IDX_993c9e3195b19f2928a42cf113; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_993c9e3195b19f2928a42cf113" ON public.note_tags USING btree ("tagsId");


--
-- Name: task_tags FK_1470ad368e79cb5636163a4bf8d; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT "FK_1470ad368e79cb5636163a4bf8d" FOREIGN KEY ("taskId") REFERENCES public.task(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: note_tags FK_48eb33cd7ddfa7ca9c5dbaff6b5; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.note_tags
    ADD CONSTRAINT "FK_48eb33cd7ddfa7ca9c5dbaff6b5" FOREIGN KEY ("notesId") REFERENCES public.notes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: habit_check FK_4f631d3373657e5bcfa7028e35e; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.habit_check
    ADD CONSTRAINT "FK_4f631d3373657e5bcfa7028e35e" FOREIGN KEY ("habitId") REFERENCES public.habit(id) ON DELETE CASCADE;


--
-- Name: habit FK_52202c28f0e9699f9ce660fb815; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.habit
    ADD CONSTRAINT "FK_52202c28f0e9699f9ce660fb815" FOREIGN KEY ("originNoteId") REFERENCES public.notes(id);


--
-- Name: notes FK_829532ff766505ad7c71592c6a5; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT "FK_829532ff766505ad7c71592c6a5" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: task_tags FK_858daeb22a80374e11b779fc72a; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT "FK_858daeb22a80374e11b779fc72a" FOREIGN KEY ("tagsId") REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tags FK_92e67dc508c705dd66c94615576; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "FK_92e67dc508c705dd66c94615576" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: note_tags FK_993c9e3195b19f2928a42cf113b; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.note_tags
    ADD CONSTRAINT "FK_993c9e3195b19f2928a42cf113b" FOREIGN KEY ("tagsId") REFERENCES public.tags(id);


--
-- Name: habit FK_999000e9ce7a69128f471f0a3f9; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.habit
    ADD CONSTRAINT "FK_999000e9ce7a69128f471f0a3f9" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: task FK_f316d3fe53497d4d8a2957db8b9; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT "FK_f316d3fe53497d4d8a2957db8b9" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

