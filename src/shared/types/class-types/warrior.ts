// #region imports
import Axe from "@shared/types/ability-types/skills/axe";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Flail from "@shared/types/ability-types/skills/flail";
import Mace from "@shared/types/ability-types/skills/mace";
import Polearm from "@shared/types/ability-types/skills/polearm";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Spear from "@shared/types/ability-types/skills/spear";
import Sword from "@shared/types/ability-types/skills/sword";
import Staff from "@shared/types/ability-types/skills/staff";
import Whip from "@shared/types/ability-types/skills/whip";
import Bash from "@shared/types/ability-types/skills/bash";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import Parry from "@shared/types/ability-types/skills/parry";
import Rescue from "@shared/types/ability-types/skills/rescue";
import Swim from "@shared/types/ability-types/skills/swim";
import Scrolls from "@shared/types/ability-types/skills/scrolls";
import Staves from "@shared/types/ability-types/skills/staves";
import Wands from "@shared/types/ability-types/skills/wands";
import Recall from "@shared/types/ability-types/skills/recall";
import Dig from "@shared/types/ability-types/skills/dig";
import Age from "@shared/types/ability-types/skills/age";
import Riding from "@shared/types/ability-types/skills/riding";
import DirtKicking from "@shared/types/ability-types/skills/dirt-kicking";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";
import Kick from "@shared/types/ability-types/skills/kick";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Disarm from "@shared/types/ability-types/skills/disarm";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import BlindFighting from "@shared/types/ability-types/skills/blind-fighting";
import Haggle from "@shared/types/ability-types/skills/haggle";
import Peek from "@shared/types/ability-types/skills/peek";
import Trip from "@shared/types/ability-types/skills/trip";

import MagicMissile from "@shared/types/ability-types/spells/magic-missile";
import CauseLight from "@shared/types/ability-types/spells/cause-light";
import CureLight from "@shared/types/ability-types/spells/cure-light";
import ArmorSpell from "@shared/types/ability-types/spells/armor";
import ChillTouch from "@shared/types/ability-types/spells/chill-touch";
import Bless from "@shared/types/ability-types/spells/bless";
import FaerieFire from "@shared/types/ability-types/spells/faerie-fire";
import BurningHands from "@shared/types/ability-types/spells/burning-hands";
import ContinualLight from "@shared/types/ability-types/spells/continual-light";
import Refresh from "@shared/types/ability-types/spells/refresh";
import CauseSerious from "@shared/types/ability-types/spells/cause-serious";
import CureSerious from "@shared/types/ability-types/spells/cure-serious";
import CreateWater from "@shared/types/ability-types/spells/create-water";
import ProtectionEvil from "@shared/types/ability-types/spells/protection-evil";
import ProtectionNeutral from "@shared/types/ability-types/spells/protection-neutral";
import ProtectionGood from "@shared/types/ability-types/spells/protection-good";
import CreateFood from "@shared/types/ability-types/spells/create-food";
import Illumination from "@shared/types/ability-types/spells/illumination";
import ShockingGrasp from "@shared/types/ability-types/spells/shocking-grasp";
import Earthquake from "@shared/types/ability-types/spells/earthquake";
import FloatingDisc from "@shared/types/ability-types/spells/floating-disc";
import Infravision from "@shared/types/ability-types/spells/infravision";
import LightningBolt from "@shared/types/ability-types/spells/lightning-bolt";
import WordOfRecall from "@shared/types/ability-types/spells/word-of-recall";
import CreateTree from "@shared/types/ability-types/spells/create-tree";
import Fireproof from "@shared/types/ability-types/spells/fireproof";
import CauseCritical from "@shared/types/ability-types/spells/cause-critical";
import CureCritical from "@shared/types/ability-types/spells/cure-critical";
import LightFoot from "@shared/types/ability-types/spells/light-foot";
import Calm from "@shared/types/ability-types/spells/calm";
import ColorSpray from "@shared/types/ability-types/spells/color-spray";
import CreateSpring from "@shared/types/ability-types/spells/create-spring";
import GiantStrength from "@shared/types/ability-types/spells/giant-strength";
import DispelEvil from "@shared/types/ability-types/spells/dispel-evil";
import DispelNeutral from "@shared/types/ability-types/spells/dispel-neutral";
import DispelGood from "@shared/types/ability-types/spells/dispel-good";
import CallLightning from "@shared/types/ability-types/spells/call-lightning";
import ControlWeather from "@shared/types/ability-types/spells/control-weather";
import Fly from "@shared/types/ability-types/spells/fly";
import RemoveCurse from "@shared/types/ability-types/spells/remove-curse";
import Summon from "@shared/types/ability-types/spells/summon";
import HeatMetal from "@shared/types/ability-types/spells/heat-metal";
import CreateRose from "@shared/types/ability-types/spells/create-rose";
import FaerieFog from "@shared/types/ability-types/spells/faerie-fog";
import Fireball from "@shared/types/ability-types/spells/fireball";
import Frenzy from "@shared/types/ability-types/spells/frenzy";
import Blizzra from "@shared/types/ability-types/spells/blizzra";
import Flamestrike from "@shared/types/ability-types/spells/flamestrike";
import Gate from "@shared/types/ability-types/spells/gate";
import Harm from "@shared/types/ability-types/spells/harm";
import Haste from "@shared/types/ability-types/spells/haste";
import DispelMagic from "@shared/types/ability-types/spells/dispel-magic";
import Sanctuary from "@shared/types/ability-types/spells/sanctuary";
import ProximityDispel from "@shared/types/ability-types/spells/proximity-dispel";
import AcidBlast from "@shared/types/ability-types/spells/acid-blast";
import Cancellation from "@shared/types/ability-types/spells/cancellation";
import ChainLightning from "@shared/types/ability-types/spells/chain-lightning";
import Teleport from "@shared/types/ability-types/spells/teleport";
import PassDoor from "@shared/types/ability-types/spells/pass-door";
import Waypoint from "@shared/types/ability-types/spells/waypoint";
import Portal from "@shared/types/ability-types/spells/portal";
import ShieldSpell, { Shield } from "@shared/types/ability-types/spells/shield";
import HolyWord from "@shared/types/ability-types/spells/holy-word";
import CauseDecay from "@shared/types/ability-types/spells/cause-decay";
import Tornado from "@shared/types/ability-types/spells/tornado";
import Demonfire from "@shared/types/ability-types/spells/demonfire";
import Nexus from "@shared/types/ability-types/spells/nexus";
import StoneSkin from "@shared/types/ability-types/spells/stone-skin";
import MassHealing from "@shared/types/ability-types/spells/mass-healing";
import RayOfTruth from "@shared/types/ability-types/spells/ray-of-truth";
import CauseFatality from "@shared/types/ability-types/spells/cause-fatality";

import BardBasics from "@shared/types/ability-types/groups-class/bard-basics";
import BardDefault from "@shared/types/ability-types/groups-class/bard-default";
import Harmful from "@shared/types/ability-types/groups-spells/harmful";
import Transportation from "@shared/types/ability-types/groups-spells/transportation";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Protective from "@shared/types/ability-types/groups-spells/protective";

import IAbility from "@shared/types/ability-types/ability";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
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
import DangerSense from "@shared/types/ability-types/skills/danger-sense";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Lore from "@shared/types/ability-types/skills/lore";
import Meditation from "@shared/types/ability-types/skills/meditation";
import PickLock from "@shared/types/ability-types/skills/pick-lock";
import Pugil from "@shared/types/ability-types/skills/pugil";
import Roundhouse from "@shared/types/ability-types/skills/roundhouse";
import BottlesOfBeer from "@shared/types/ability-types/songs/bottles-of-beer";
import GreenLeaf from "@shared/types/ability-types/songs/green-leaf";
import Lullaby from "@shared/types/ability-types/songs/lullaby";
import MarriageSong from "@shared/types/ability-types/songs/marriage-song";
import Nightmare from "@shared/types/ability-types/songs/nightmare";
import NoEyes from "@shared/types/ability-types/songs/no-eyes";
import PiercingWinds from "@shared/types/ability-types/songs/piering-winds";
import ReleaseMe from "@shared/types/ability-types/songs/release-me";
import RevealAll from "@shared/types/ability-types/songs/reveal-all";
import RoostersCrow from "@shared/types/ability-types/songs/roosters-crow";
import RunRiot from "@shared/types/ability-types/songs/run-riot";
import ScreechingBanshee from "@shared/types/ability-types/songs/screeching-banshee";
import ShieldOfWords from "@shared/types/ability-types/songs/shield-of-words";
import SongOfCharm from "@shared/types/ability-types/songs/song-of-charm";
import SongOfHealing from "@shared/types/ability-types/songs/song-of-healing";
import SongOfPeace from "@shared/types/ability-types/songs/song-of-peace";
import SongOfWar from "@shared/types/ability-types/songs/song-of-war";
import TorchBurns from "@shared/types/ability-types/songs/torch-burns";
import TravelTune from "@shared/types/ability-types/songs/travel-tune";
import WakeTheDead from "@shared/types/ability-types/songs/wake-the-dead";
import WeCome from "@shared/types/ability-types/songs/we-come";
import WeaknessWithin from "@shared/types/ability-types/songs/weakness-within";
import HymnsOfLife from "@shared/types/ability-types/groups-songs/hymns-of-life";
import WarHymns from "@shared/types/ability-types/groups-songs/war-hymns";
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
  imgCreditUrl: string;
  primaryAttribute: IStatAttribute;
  secondaryAttribute: IStatAttribute;
  armorType: IDslArmorType;
  classGroup: string;
  raceRestrictions: IRace[];
  abilities: Map<number, IAbility[]>;
  characterCreationAbilityGroups: Map<number, IAbilityGroup[]>;
  characterCreationSkills: Map<number, IAbility[]>;
  baseCpModifier: number;
  cpRacialModifiers: Map<IRace, number>;
  helpfile: string;
  castsAtLevel: boolean;
  castingLevelModifier: number;
  notes?: string;
  buffActions?: IAbility[] | undefined;

  constructor() {
    this.id = MortalClass.Bard.id;
    this.name = MortalClass.Bard.name;
    this.displayName = MortalClass.Bard.displayName;
    this.isMortalClass = true;
    this.isReclass = false;
    this.isCsr = false;
    this.baseClass = MortalClass.Bard;
    this.classType = MortalClass.Bard;
    this.imgUrl = "/img/classes/bard.png";
    this.imgCreditUrl =
      "https://i.pinimg.com/originals/2b/f9/73/2bf973516fefa8df40bb4a347e16ef63.jpg";
    this.primaryAttribute = new StatAttribute({ type: StatAttributeType.Intelligence });
    this.secondaryAttribute = new StatAttribute({ type: StatAttributeType.Wisdom });
    this.armorType = DslArmorType.Studded;
    this.classGroup = MortalClass.Bard.toString();
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
    this.abilities = new Map<number, IAbility[]>([
      [1, [
        Dagger.GetInstance(),
        Flail.GetInstance(),
        Staff.GetInstance(),
        Whip.GetInstance(),
        Haggle.GetInstance(),
        Swim.GetInstance(),
        Scrolls.GetInstance(),
        Staves.GetInstance(),
        Wands.GetInstance()
      ]],
      [3, [
        Recall.GetInstance(),
        Dig.GetInstance(),
        Age.GetInstance(),
        DangerSense.GetInstance(),
        DirtKicking.GetInstance(),
        Dodge.GetInstance(),
        CauseLight.GetInstance(),
        TorchBurns.GetInstance()
      ]],
      [4, [Trip.GetInstance()]],
      [6, [Lore.GetInstance()]],
      [7, [Kick.GetInstance(), SongOfWar.GetInstance()]],
      [9, [PickLock.GetInstance(), TravelTune.GetInstance()]],
      [10, [
        Roundhouse.GetInstance(),
        ArmorSpell.GetInstance(),
        CauseSerious.GetInstance(),
        Infravision.GetInstance()
      ]],
      [11, [BottlesOfBeer.GetInstance()]],
      [12, [
        Meditation.GetInstance(),
        Refresh.GetInstance(),
        NoEyes.GetInstance()
      ]],
      [13, [Parry.GetInstance()]],
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
    this.characterCreationAbilityGroups = new Map<number, IAbilityGroup[]>([
      [0, [BardBasics.GetInstance()]],
      [4, [Harmful.GetInstance()]],
      [6, [Transportation.GetInstance(), HymnsOfLife.GetInstance()]],
      [7, [Enhancement.GetInstance()]],
      [8, [WarHymns.GetInstance(), Protective.GetInstance()]],
      [40, [BardDefault.GetInstance()]]
    ]);
    this.characterCreationSkills = new Map<number, IAbility[]>([
      [4, [
        Dagger.GetInstance(),
        BlindFighting.GetInstance(),
        EnhancedDamage.GetInstance(),
        Parry.GetInstance(),
        SecondAttack.GetInstance(),
        Meditation.GetInstance(),
        DangerSense.GetInstance(),
        Flail.GetInstance(),
        DirtKicking.GetInstance(),
        HandToHand.GetInstance(),
        Pugil.GetInstance(),
        Haggle.GetInstance(),
        PickLock.GetInstance(),
        Whip.GetInstance(),
        Dodge.GetInstance(),
        Kick.GetInstance(),
        Trip.GetInstance(),
        Lore.GetInstance(),
        Roundhouse.GetInstance()
      ]]
    ]);
    this.baseCpModifier = 0;
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
    this.castsAtLevel = false;
    this.castingLevelModifier = 0;
    this.notes = "";
    this.buffActions = undefined;
  }

  public static GetInstance(): Bard {
    if (!Bard.instance) {
      Bard.instance = new Bard();
    }
    return Bard.instance;
  }

  public Get<T>(): T {
    return Bard.GetInstance() as unknown as T;
  }
}

export default Bard;
