// #region imports
import Dagger from "@shared/types/ability-types/skills/Dagger";
import Flail from "@shared/types/ability-types/skills/Flail";
import Staff from "@shared/types/ability-types/skills/Staff";
import Whip from "@shared/types/ability-types/skills/Whip";
import Haggle from "@shared/types/ability-types/skills/Haggle";
import Swim from "@shared/types/ability-types/skills/Swim";
import Scrolls from "@shared/types/ability-types/skills/Scrolls";
import Staves from "@shared/types/ability-types/skills/Staves";
import Wands from "@shared/types/ability-types/skills/Wands";
import Recall from "@shared/types/ability-types/skills/Recall";
import Dig from "@shared/types/ability-types/skills/Dig";
import Age from "@shared/types/ability-types/skills/Age";
import DangerSense from "@shared/types/ability-types/skills/DangerSense";
import DirtKicking from "@shared/types/ability-types/skills/DirtKicking";
import Dodge from "@shared/types/ability-types/skills/Dodge";
import Trip from "@shared/types/ability-types/skills/Trip";
import Lore from "@shared/types/ability-types/skills/Lore";
import Kick from "@shared/types/ability-types/skills/Kick";
import PickLock from "@shared/types/ability-types/skills/PickLock";
import Roundhouse from "@shared/types/ability-types/skills/Roundhouse";
import Meditation from "@shared/types/ability-types/skills/Meditation";
import Parry from "@shared/types/ability-types/skills/Parry";
import HandToHand from "@shared/types/ability-types/skills/HandToHand";
import SecondAttack from "@shared/types/ability-types/skills/SecondAttack";
import Pugil from "@shared/types/ability-types/skills/Pugil";
import BlindFighting from "@shared/types/ability-types/skills/BlindFighting";
import EnhancedDamage from "@shared/types/ability-types/skills/EnhancedDamage";
import CauseLight from "@shared/types/ability-types/spells/cause-light";
import Armor from "@shared/types/ability-types/spells/Armor";
import CauseSerious from "@shared/types/ability-types/spells/cause-serious";
import Infravision from "@shared/types/ability-types/spells/Infravision";
import Refresh from "@shared/types/ability-types/spells/Refresh";
import WordOfRecall from "@shared/types/ability-types/spells/WordOfRecall";
import ProtectionEvil from "@shared/types/ability-types/spells/ProtectionEvil";
import ProtectionNeutral from "@shared/types/ability-types/spells/ProtectionNeutral";
import ProtectionGood from "@shared/types/ability-types/spells/ProtectionGood";
import LightFoot from "@shared/types/ability-types/spells/LightFoot";
import CauseCritical from "@shared/types/ability-types/spells/CauseCritical";
import Fireproof from "@shared/types/ability-types/spells/Fireproof";
import Fly from "@shared/types/ability-types/spells/Fly";
import GiantStrength from "@shared/types/ability-types/spells/GiantStrength";
import PassDoor from "@shared/types/ability-types/spells/PassDoor";
import Teleport from "@shared/types/ability-types/spells/Teleport";
import Haste from "@shared/types/ability-types/spells/haste";
import Harm from "@shared/types/ability-types/spells/Harm";
import Summon from "@shared/types/ability-types/spells/Summon";
import DispelMagic from "@shared/types/ability-types/spells/DispelMagic";
import ProximityDispel from "@shared/types/ability-types/spells/ProximityDispel";
import Gate from "@shared/types/ability-types/spells/Gate";
import Cancellation from "@shared/types/ability-types/spells/Cancellation";
import Shield from "@shared/types/ability-types/spells/Shield";
import Waypoint from "@shared/types/ability-types/spells/Waypoint";
import StoneSkin from "@shared/types/ability-types/spells/StoneSkin";
import Sanctuary from "@shared/types/ability-types/spells/Sanctuary";
import CauseDecay from "@shared/types/ability-types/spells/cause-decay";
import Portal from "@shared/types/ability-types/spells/Portal";
import Nexus from "@shared/types/ability-types/spells/Nexus";
import CauseFatality from "@shared/types/ability-types/spells/cause-fatality";
import TorchBurns from "@shared/types/ability-types/songs/TorchBurns";
import SongOfWar from "@shared/types/ability-types/songs/SongOfWar";
import TravelTune from "@shared/types/ability-types/songs/TravelTune";
import BottlesOfBeer from "@shared/types/ability-types/songs/BottlesOfBeer";
import NoEyes from "@shared/types/ability-types/songs/NoEyes";
import WeaknessWithin from "@shared/types/ability-types/songs/WeaknessWithin";
import RevealAll from "@shared/types/ability-types/songs/RevealAll";
import WeCome from "@shared/types/ability-types/songs/WeCome";
import SongOfHealing from "@shared/types/ability-types/songs/SongOfHealing";
import SongOfPeace from "@shared/types/ability-types/songs/SongOfPeace";
import Lullaby from "@shared/types/ability-types/songs/Lullaby";
import MarriageSong from "@shared/types/ability-types/songs/MarriageSong";
import ScreechingBanshee from "@shared/types/ability-types/songs/ScreechingBanshee";
import Nightmare from "@shared/types/ability-types/songs/Nightmare";
import ReleaseMe from "@shared/types/ability-types/songs/ReleaseMe";
import ShieldOfWords from "@shared/types/ability-types/songs/ShieldOfWords";
import SongOfCharm from "@shared/types/ability-types/songs/SongOfCharm";
import RoostersCrow from "@shared/types/ability-types/songs/RoostersCrow";
import WakeTheDead from "@shared/types/ability-types/songs/WakeTheDead";
import RunRiot from "@shared/types/ability-types/songs/RunRiot";
import GreenLeaf from "@shared/types/ability-types/songs/GreenLeaf";
import BardBasics from "@shared/types/ability-types/groups-class/BardBasics";
import BardDefault from "@shared/types/ability-types/groups-class/BardDefault";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Transportation from "@shared/types/ability-types/groups-spells/Transportation";
import Harmful from "@shared/types/ability-types/groups-spells/Harmful";
import Protective from "@shared/types/ability-types/groups-spells/Protective";
import IAbility from "@shared/types/ability-types/ability";
import { IMortalClass, IClassType, MortalClass } from "@shared/types/character-types/class-type";
import IDslClass from "@shared/types/character-types/dslClass";
import IRace from "@shared/types/character-types/race-interface";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import DslArmorType from "@shared/types/item-types/armor-type";
import IDslArmorType from "@shared/types/item-types/armor-type-interface";
import Ogre from "@shared/types/race-types/Ogre";
import GiantOgre from "@shared/types/race-types/GiantOgre";
import Bugbear from "@shared/types/race-types/Bugbear";
import Wemic from "@shared/types/race-types/Wemic";
import Arboren from "@shared/types/race-types/Arboren";
import Troll from "@shared/types/race-types/Troll";
import Orc from "@shared/types/race-types/Orc";
import Bakali from "@shared/types/race-types/Bakali";
import GullyDwarf from "@shared/types/race-types/GullyDwarf";
import Pixie from "@shared/types/race-types/Pixie";
import Human from "@shared/types/race-types/Human";
import HalfElf from "@shared/types/race-types/HalfElf";
import WildElf from "@shared/types/race-types/WildElf";
import ShalonestiElf from "@shared/types/race-types/ShalonestiElf";
import SeaElf from "@shared/types/race-types/SeaElf";
import DarkElf from "@shared/types/race-types/DarkElf";
import HillDwarf from "@shared/types/race-types/HillDwarf";
import MountainDwarf from "@shared/types/race-types/MountainDwarf";
import DarkDwarf from "@shared/types/race-types/DarkDwarf";
import Mul from "@shared/types/race-types/Mul";
import HalfOgre from "@shared/types/race-types/HalfOgre";
import Goblin from "@shared/types/race-types/Goblin";
import HobGoblin from "@shared/types/race-types/HobGoblin";
import TinkerGnome from "@shared/types/race-types/TinkerGnome";
import DeepGnome from "@shared/types/race-types/DeepGnome";
import Felar from "@shared/types/race-types/Felar";
import Minotaur from "@shared/types/race-types/Minotaur";
import Kender from "@shared/types/race-types/Kender";
import Yinn from "@shared/types/race-types/Yinn";
import PiercingWinds from "@shared/types/ability-types/songs/PiercingWinds";
import WarHymns from "@shared/types/ability-types/groups-songs/WarHymns";
import HymnsOfLife from "@shared/types/ability-types/groups-songs/HymnsOfLife";
import StoneFountain from "@shared/types/ability-types/songs/StoneFountain";
import ServerCache from "@shared/cache/server-cache";
// #endregion

export class Bard implements IDslClass, IMortalClass, IClassType {
  private static instance: Bard;

  id: string;
  name: string;
  displayName: string;
  isMortalClass: boolean;
  isReclass: boolean;
  isCsr: boolean;
  baseClass: IClassType;
  classType: IClassType;
  imgUrl: string;
  primaryAttribute: IStatAttribute;
  secondaryAttribute: IStatAttribute;
  armorType: IDslArmorType;
  classGroup: string;
  raceRestrictions: IRace[];
  abilities: Map<number, IAbility[]>;
  characterCreationAbilityGroups: { [groupName: string]: number };
  characterCreationSkills: { [abilityName: string]: number };
  baseCpModifier: number;
  helpfile: string;
  castsAtLevel: boolean;
  castingLevelModifier: number;
  notes?: string;
  cpRacialModifiers: Map<IRace, number>;
  buffActions?: IAbility[] | undefined;
  adept?: number | undefined;
  isMoonAffected?: boolean | undefined;

  constructor() {
    this.id = MortalClass.Bard.id;
    this.name = this.constructor.name;
    this.displayName = MortalClass.Bard.displayName;
    this.isMortalClass = true;
    this.isReclass = false;
    this.isCsr = false;
    this.baseClass = MortalClass.Bard;
    this.classType = MortalClass.Bard;
    this.imgUrl = "/img/classes/bard.png";
    this.primaryAttribute = new StatAttribute({ type: StatAttributeType.Wisdom });
    this.secondaryAttribute = new StatAttribute({ type: StatAttributeType.Intelligence });
    this.armorType = DslArmorType.Studded;
    this.classGroup = MortalClass.Bard.toString();
    // Verified against ShatteredArchive 2025-02-18
    this.raceRestrictions = [
      Ogre.GetInstance(),
      GiantOgre.GetInstance(),
      Bugbear.GetInstance(),
      Wemic.GetInstance(),
      Arboren.GetInstance(),
      Troll.GetInstance(),
      Orc.GetInstance(),
      Bakali.GetInstance(),
      GullyDwarf.GetInstance(),
      Pixie.GetInstance()
    ];

    // Verified against ShatteredArchive 2025-02-18
    this.abilities = new Map<number, IAbility[]>([
      [1, [
        Age.GetInstance(),
        Recall.GetInstance(),
        Dagger.GetInstance(),
        Flail.GetInstance(),
        Haggle.GetInstance(),
        Scrolls.GetInstance(),
        Staff.GetInstance(),
        Staves.GetInstance(),
        Swim.GetInstance(),
        Wands.GetInstance(),
        Whip.GetInstance(),
      ]],
      [3, [
        CauseLight.GetInstance(),
        DangerSense.GetInstance(),
        Dig.GetInstance(),
        DirtKicking.GetInstance(),
        Dodge.GetInstance(),
        TorchBurns.GetInstance()
      ]],
      [4, [Trip.GetInstance()]],
      [6, [Lore.GetInstance()]],
      [7, [Kick.GetInstance(), SongOfWar.GetInstance()]],
      [9, [PickLock.GetInstance(), TravelTune.GetInstance()]],
      [10, [
        Armor.GetInstance(),
        CauseSerious.GetInstance(),
        Infravision.GetInstance(),
        Roundhouse.GetInstance(),
      ]],
      [11, [BottlesOfBeer.GetInstance()]],
      [12, [
        Meditation.GetInstance(),
        Refresh.GetInstance(),
        NoEyes.GetInstance()
      ]],
      [13, [Parry.GetInstance()]],
      [14, [StoneFountain.GetInstance()]],
      [15, [
        HandToHand.GetInstance(),
        SecondAttack.GetInstance(),
        PiercingWinds.GetInstance()
      ]],
      [16, [WordOfRecall.GetInstance()]],
      [17, [
        ProtectionEvil.GetInstance(),
        ProtectionNeutral.GetInstance(),
        ProtectionGood.GetInstance()
      ]],
      [18, [
        LightFoot.GetInstance(),
        WeaknessWithin.GetInstance()
      ]],
      [19, [
        Pugil.GetInstance(),
        CauseCritical.GetInstance(),
        Fireproof.GetInstance()
      ]],
      [20, [Fly.GetInstance()]],
      [22, [GiantStrength.GetInstance(), RevealAll.GetInstance()]],
      [23, [BlindFighting.GetInstance(), WeCome.GetInstance()]],
      [25, [
        EnhancedDamage.GetInstance(),
        PassDoor.GetInstance(),
        Teleport.GetInstance(),
        SongOfHealing.GetInstance()
      ]],
      [26, [Haste.GetInstance(), SongOfPeace.GetInstance()]],
      [27, [Lullaby.GetInstance()]],
      [28, [Harm.GetInstance(), MarriageSong.GetInstance()]],
      [29, [Summon.GetInstance(), ScreechingBanshee.GetInstance()]],
      [30, [
        DispelMagic.GetInstance(),
        ProximityDispel.GetInstance(),
        Nightmare.GetInstance()
      ]],
      [31, [ReleaseMe.GetInstance()]],
      [32, [Gate.GetInstance(), ShieldOfWords.GetInstance()]],
      [34, [Cancellation.GetInstance()]],
      [35, [Shield.GetInstance(), SongOfCharm.GetInstance()]],
      [38, [RoostersCrow.GetInstance()]],
      [39, [Waypoint.GetInstance()]],
      [40, [StoneSkin.GetInstance()]],
      [41, [WakeTheDead.GetInstance()]],
      [42, [Sanctuary.GetInstance(), CauseDecay.GetInstance()]],
      [44, [RunRiot.GetInstance()]],
      [45, [Portal.GetInstance()]],
      [46, [GreenLeaf.GetInstance()]],
      [50, [Nexus.GetInstance(), CauseFatality.GetInstance()]]
    ]);

    // Verified against ShatteredArchive 2025-02-18
    this.characterCreationAbilityGroups = {
      [BardBasics.GetInstance().name]: 0,
      [BardDefault.GetInstance().name]: 40,
      [Enhancement.GetInstance().name]: 7,
      [Transportation.GetInstance().name]: 6,
      [Harmful.GetInstance().name]: 4,
      [WarHymns.GetInstance().name]: 8,
      [Protective.GetInstance().name]: 8,
      [HymnsOfLife.GetInstance().name]: 6
    }

    // Verified against ShatteredArchive 2025-02-18
    this.characterCreationSkills = {
      [Dagger.GetInstance().name]: 4,
      [BlindFighting.GetInstance().name]: 12,
      [EnhancedDamage.GetInstance().name]: 10,
      [Parry.GetInstance().name]: 8,
      [SecondAttack.GetInstance().name]: 6,
      [Meditation.GetInstance().name]: 5,
      [DangerSense.GetInstance().name]: 6,
      [Flail.GetInstance().name]: 4,
      [DirtKicking.GetInstance().name]: 6,
      [HandToHand.GetInstance().name]: 6,
      [Pugil.GetInstance().name]: 6,
      [Haggle.GetInstance().name]: 2,
      [PickLock.GetInstance().name]: 4,
      [Whip.GetInstance().name]: 4,
      [Dodge.GetInstance().name]: 6,
      [Kick.GetInstance().name]: 1,
      [Trip.GetInstance().name]: 4,
      [Lore.GetInstance().name]: 4,
      [Roundhouse.GetInstance().name]: 4
    };
    
    this.baseCpModifier = 0;
    // Verified against ShatteredArchive 2025-02-18
    this.cpRacialModifiers = new Map<IRace, number>([
      [Human.GetInstance(), 1.0],
      [HalfElf.GetInstance(), 1.1],
      [WildElf.GetInstance(), 1.5],
      [ShalonestiElf.GetInstance(), 1.1],
      [SeaElf.GetInstance(), 1.3],
      [DarkElf.GetInstance(), 1.1],
      [HillDwarf.GetInstance(), 1.5],
      [MountainDwarf.GetInstance(), 1.4],
      [DarkDwarf.GetInstance(), 1.9],
      [Mul.GetInstance(), 1.5],
      [HalfOgre.GetInstance(), 1.75],
      [Goblin.GetInstance(), 2.0],
      [HobGoblin.GetInstance(), 1.0],
      [TinkerGnome.GetInstance(), 1.5],
      [DeepGnome.GetInstance(), 1.7],
      [Felar.GetInstance(), 1.6],
      [Minotaur.GetInstance(), 1.9],
      [Kender.GetInstance(), 1.1],
      [Yinn.GetInstance(), 1.8]
    ]);

    this.helpfile =
`help bard
BARDS
BARDS

Bards are a class of musicians that know some of the fighting skills, mostly
the ones they would pick up in bar fights, and then they have their
repertoire of songs which produce varying effects.

Bards are well known for being drunk and spending a lot of time in bars or
taverns.

Skills :

war hymns         songs used preparing for and during combat
hymns of life     songs used in healing and in creation
second attack     allows the bard to strike an extra time in combat
dodge             the ability to dodge attacks against you
pugil             staff wielder strikes more often in combat
parry             being able to deflect blows with one's weapon
enhanced damage   blows are more effective and deal more damage
roundhouse        a wild swing able to knock an opponent off their feet

See also : BARDSONG SONGS HYMNS
`;
    this.castsAtLevel = true;
    this.isMoonAffected = false;
    this.castingLevelModifier = 1.0;
    this.notes = "";
    this.buffActions = undefined;
  }

  public static GetInstance(): Bard {
    if (!Bard.instance) {
      Bard.instance = new Bard();
      ServerCache.Classes[this.instance.name] = this.instance;
    }
    return Bard.instance;
  }

  public Get<T>(): T {
    return Bard.GetInstance() as unknown as T;
  }
}

export default Bard;
