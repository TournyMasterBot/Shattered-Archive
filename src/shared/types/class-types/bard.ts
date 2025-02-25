// #region imports
import Dagger from "@shared/types/ability-types/skills/dagger";
import Flail from "@shared/types/ability-types/skills/flail";
import Staff from "@shared/types/ability-types/skills/staff";
import Whip from "@shared/types/ability-types/skills/whip";
import Haggle from "@shared/types/ability-types/skills/haggle";
import Swim from "@shared/types/ability-types/skills/swim";
import Scrolls from "@shared/types/ability-types/skills/scrolls";
import Staves from "@shared/types/ability-types/skills/staves";
import Wands from "@shared/types/ability-types/skills/wands";
import Recall from "@shared/types/ability-types/skills/recall";
import Dig from "@shared/types/ability-types/skills/dig";
import Age from "@shared/types/ability-types/skills/age";
import DangerSense from "@shared/types/ability-types/skills/danger-sense";
import DirtKicking from "@shared/types/ability-types/skills/dirt-kicking";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Trip from "@shared/types/ability-types/skills/trip";
import Lore from "@shared/types/ability-types/skills/lore";
import Kick from "@shared/types/ability-types/skills/kick";
import PickLock from "@shared/types/ability-types/skills/pick-lock";
import Roundhouse from "@shared/types/ability-types/skills/roundhouse";
import Meditation from "@shared/types/ability-types/skills/meditation";
import Parry from "@shared/types/ability-types/skills/parry";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Pugil from "@shared/types/ability-types/skills/pugil";
import BlindFighting from "@shared/types/ability-types/skills/blind-fighting";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import CauseLight from "@shared/types/ability-types/spells/cause-light";
import Armor from "@shared/types/ability-types/spells/armor";
import CauseSerious from "@shared/types/ability-types/spells/cause-serious";
import Infravision from "@shared/types/ability-types/spells/infravision";
import Refresh from "@shared/types/ability-types/spells/refresh";
import WordOfRecall from "@shared/types/ability-types/spells/word-of-recall";
import ProtectionEvil from "@shared/types/ability-types/spells/protection-evil";
import ProtectionNeutral from "@shared/types/ability-types/spells/protection-neutral";
import ProtectionGood from "@shared/types/ability-types/spells/protection-good";
import LightFoot from "@shared/types/ability-types/spells/light-foot";
import CauseCritical from "@shared/types/ability-types/spells/cause-critical";
import Fireproof from "@shared/types/ability-types/spells/fireproof";
import Fly from "@shared/types/ability-types/spells/fly";
import GiantStrength from "@shared/types/ability-types/spells/giant-strength";
import PassDoor from "@shared/types/ability-types/spells/pass-door";
import Teleport from "@shared/types/ability-types/spells/teleport";
import Haste from "@shared/types/ability-types/spells/haste";
import Harm from "@shared/types/ability-types/spells/harm";
import Summon from "@shared/types/ability-types/spells/summon";
import DispelMagic from "@shared/types/ability-types/spells/dispel-magic";
import ProximityDispel from "@shared/types/ability-types/spells/proximity-dispel";
import Gate from "@shared/types/ability-types/spells/gate";
import Cancellation from "@shared/types/ability-types/spells/cancellation";
import Shield from "@shared/types/ability-types/spells/shield";
import Waypoint from "@shared/types/ability-types/spells/waypoint";
import StoneSkin from "@shared/types/ability-types/spells/stone-skin";
import Sanctuary from "@shared/types/ability-types/spells/sanctuary";
import CauseDecay from "@shared/types/ability-types/spells/cause-decay";
import Portal from "@shared/types/ability-types/spells/portal";
import Nexus from "@shared/types/ability-types/spells/nexus";
import CauseFatality from "@shared/types/ability-types/spells/cause-fatality";
import TorchBurns from "@shared/types/ability-types/songs/torch-burns";
import SongOfWar from "@shared/types/ability-types/songs/song-of-war";
import TravelTune from "@shared/types/ability-types/songs/travel-tune";
import BottlesOfBeer from "@shared/types/ability-types/songs/bottles-of-beer";
import NoEyes from "@shared/types/ability-types/songs/no-eyes";
import WeaknessWithin from "@shared/types/ability-types/songs/weakness-within";
import RevealAll from "@shared/types/ability-types/songs/reveal-all";
import WeCome from "@shared/types/ability-types/songs/we-come";
import SongOfHealing from "@shared/types/ability-types/songs/song-of-healing";
import SongOfPeace from "@shared/types/ability-types/songs/song-of-peace";
import Lullaby from "@shared/types/ability-types/songs/lullaby";
import MarriageSong from "@shared/types/ability-types/songs/marriage-song";
import ScreechingBanshee from "@shared/types/ability-types/songs/screeching-banshee";
import Nightmare from "@shared/types/ability-types/songs/nightmare";
import ReleaseMe from "@shared/types/ability-types/songs/release-me";
import ShieldOfWords from "@shared/types/ability-types/songs/shield-of-words";
import SongOfCharm from "@shared/types/ability-types/songs/song-of-charm";
import RoostersCrow from "@shared/types/ability-types/songs/roosters-crow";
import WakeTheDead from "@shared/types/ability-types/songs/wake-the-dead";
import RunRiot from "@shared/types/ability-types/songs/run-riot";
import GreenLeaf from "@shared/types/ability-types/songs/green-leaf";
import BardBasics from "@shared/types/ability-types/groups-class/bard-basics";
import BardDefault from "@shared/types/ability-types/groups-class/bard-default";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Transportation from "@shared/types/ability-types/groups-spells/transportation";
import Harmful from "@shared/types/ability-types/groups-spells/harmful";
import Protective from "@shared/types/ability-types/groups-spells/protective";
import IAbility from "@shared/types/ability-types/ability";
import { IMortalClass, IClassType, MortalClass } from "@shared/types/character-types/class-type";
import IDslClass from "@shared/types/character-types/dslClass";
import IRace from "@shared/types/character-types/race-interface";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import DslArmorType from "@shared/types/item-types/armor-type";
import IDslArmorType from "@shared/types/item-types/armor-type-interface";
import Ogre from "@shared/types/race-types/ogre";
import GiantOgre from "@shared/types/race-types/giant-ogre";
import Bugbear from "@shared/types/race-types/bugbear";
import Wemic from "@shared/types/race-types/wemic";
import Arboren from "@shared/types/race-types/arboren";
import Troll from "@shared/types/race-types/troll";
import Orc from "@shared/types/race-types/orc";
import Bakali from "@shared/types/race-types/bakali";
import GullyDwarf from "@shared/types/race-types/gully-dwarf";
import Pixie from "@shared/types/race-types/pixie";
import Human from "@shared/types/race-types/human";
import HalfElf from "@shared/types/race-types/half-elf";
import WildElf from "@shared/types/race-types/wild-elf";
import ShalonestiElf from "@shared/types/race-types/shalonesti-elf";
import SeaElf from "@shared/types/race-types/sea-elf";
import DarkElf from "@shared/types/race-types/dark-elf";
import HillDwarf from "@shared/types/race-types/hill-dwarf";
import MountainDwarf from "@shared/types/race-types/mountain-dwarf";
import DarkDwarf from "@shared/types/race-types/dark-dwarf";
import Mul from "@shared/types/race-types/mul";
import HalfOgre from "@shared/types/race-types/half-ogre";
import Goblin from "@shared/types/race-types/goblin";
import HobGoblin from "@shared/types/race-types/hobgoblin";
import TinkerGnome from "@shared/types/race-types/tinker-gnome";
import DeepGnome from "@shared/types/race-types/deep-gnome";
import Felar from "@shared/types/race-types/felar";
import Minotaur from "@shared/types/race-types/minotaur";
import Kender from "@shared/types/race-types/kender";
import Yinn from "@shared/types/race-types/yinn";
import PiercingWinds from "@shared/types/ability-types/songs/piering-winds";
import WarHymns from "@shared/types/ability-types/groups-songs/war-hymns";
import HymnsOfLife from "@shared/types/ability-types/groups-songs/hymns-of-life";
import StoneFountain from "@shared/types/ability-types/songs/stone-fountain";
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
