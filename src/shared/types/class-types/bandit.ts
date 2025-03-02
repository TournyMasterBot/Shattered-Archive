import BanditBasics from "@shared/types/ability-types/groups-class/BanditBasics";
import BanditDefault from "@shared/types/ability-types/groups-class/BanditDefault";
import Weaponsmaster from "@shared/types/ability-types/groups-skills/Weaponsmaster";
import Combat from "@shared/types/ability-types/groups-spells/Combat";
import Creation from "@shared/types/ability-types/groups-spells/Creation";
import Detection from "@shared/types/ability-types/groups-spells/Detection";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import Illusion from "@shared/types/ability-types/groups-spells/Illusion";
import Maladictions from "@shared/types/ability-types/groups-spells/Maladictions";
import Protective from "@shared/types/ability-types/groups-spells/Protective";
import Transportation from "@shared/types/ability-types/groups-spells/Transportation";
import Axe from "@shared/types/ability-types/skills/Axe";
import Backstab from "@shared/types/ability-types/skills/Backstab";
import Bash from "@shared/types/ability-types/skills/Bash";
import BlindFighting from "@shared/types/ability-types/skills/BlindFighting";
import DirtKicking from "@shared/types/ability-types/skills/DirtKicking";
import Disarm from "@shared/types/ability-types/skills/Disarm";
import Dodge from "@shared/types/ability-types/skills/dodge";
import DualWield from "@shared/types/ability-types/skills/dual-wield";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import Envenom from "@shared/types/ability-types/skills/envenom";
import FastHealing from "@shared/types/ability-types/skills/fast-healing";
import Flail from "@shared/types/ability-types/skills/flail";
import Haggle from "@shared/types/ability-types/skills/haggle";
import Halt from "@shared/types/ability-types/skills/halt";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";
import Inspect from "@shared/types/ability-types/skills/inspect";
import Kick from "@shared/types/ability-types/skills/kick";
import Lore from "@shared/types/ability-types/skills/lore";
import Mace from "@shared/types/ability-types/skills/mace";
import Meditation from "@shared/types/ability-types/skills/meditation";
import PanicEnemy from "@shared/types/ability-types/skills/panic-enemy";
import Parry from "@shared/types/ability-types/skills/parry";
import Peek from "@shared/types/ability-types/skills/peek";
import PickLock from "@shared/types/ability-types/skills/pick-lock";
import Polearm from "@shared/types/ability-types/skills/polearm";
import PotionSmash from "@shared/types/ability-types/skills/potion-smash";
import Riding from "@shared/types/ability-types/skills/riding";
import Riot from "@shared/types/ability-types/skills/riot";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Spear from "@shared/types/ability-types/skills/spear";
import Staff from "@shared/types/ability-types/skills/staff";
import Steal from "@shared/types/ability-types/skills/steal";
import Stealth from "@shared/types/ability-types/skills/stealth";
import Sword from "@shared/types/ability-types/skills/sword";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import Trip from "@shared/types/ability-types/skills/trip";
import Waylay from "@shared/types/ability-types/skills/waylay";
import Whip from "@shared/types/ability-types/skills/whip";
import AcidBlast from "@shared/types/ability-types/spells/acid-blast";
import Armor from "@shared/types/ability-types/spells/armor";
import Blindness from "@shared/types/ability-types/spells/blindness";
import Blizzard from "@shared/types/ability-types/spells/blizzard";
import BurningHands from "@shared/types/ability-types/spells/burning-hands";
import Cancellation from "@shared/types/ability-types/spells/cancellation";
import ChainLightning from "@shared/types/ability-types/spells/chain-lightning";
import ChillTouch from "@shared/types/ability-types/spells/chill-touch";
import ColorSpray from "@shared/types/ability-types/spells/color-spray";
import ContinualLight from "@shared/types/ability-types/spells/continual-light";
import CreateRose from "@shared/types/ability-types/spells/create-rose";
import CreateSpring from "@shared/types/ability-types/spells/create-spring";
import CreateTree from "@shared/types/ability-types/spells/create-tree";
import CreateWater from "@shared/types/ability-types/spells/create-water";
import Curse from "@shared/types/ability-types/spells/curse";
import DetectEvil from "@shared/types/ability-types/spells/detect-evil";
import DetectGood from "@shared/types/ability-types/spells/detect-good";
import DetectHidden from "@shared/types/ability-types/spells/detect-hidden";
import DetectInvis from "@shared/types/ability-types/spells/detect-invis";
import DetectMagic from "@shared/types/ability-types/spells/detect-magic";
import DetectPoison from "@shared/types/ability-types/spells/detect-poison";
import DispelMagic from "@shared/types/ability-types/spells/dispel-magic";
import EnergyDrain from "@shared/types/ability-types/spells/energy-drain";
import Farsight from "@shared/types/ability-types/spells/farsight";
import Fireball from "@shared/types/ability-types/spells/fireball";
import Fireproof from "@shared/types/ability-types/spells/fireproof";
import FloatingDisc from "@shared/types/ability-types/spells/floating-disc";
import Fly from "@shared/types/ability-types/spells/fly";
import Gate from "@shared/types/ability-types/spells/gate";
import GiantStrength from "@shared/types/ability-types/spells/giant-strength";
import Haste from "@shared/types/ability-types/spells/haste";
import Identify from "@shared/types/ability-types/spells/identify";
import Illumination from "@shared/types/ability-types/spells/illumination";
import Infravision from "@shared/types/ability-types/spells/infravision";
import Invisibility from "@shared/types/ability-types/spells/invisibility";
import KnowAlignment from "@shared/types/ability-types/spells/know-alignment";
import LightFoot from "@shared/types/ability-types/spells/light-foot";
import MagicMissile from "@shared/types/ability-types/spells/magic-missile";
import MassInvis from "@shared/types/ability-types/spells/mass-invis";
import Nexus from "@shared/types/ability-types/spells/nexus";
import PassDoor from "@shared/types/ability-types/spells/pass-door";
import Plague from "@shared/types/ability-types/spells/plague";
import Poison from "@shared/types/ability-types/spells/poison";
import Portal from "@shared/types/ability-types/spells/portal";
import ProtectionEvil from "@shared/types/ability-types/spells/protection-evil";
import ProtectionGood from "@shared/types/ability-types/spells/protection-good";
import ProtectionNeutral from "@shared/types/ability-types/spells/protection-neutral";
import ProximityDispel from "@shared/types/ability-types/spells/proximity-dispel";
import Refresh from "@shared/types/ability-types/spells/refresh";
import Sanctuary from "@shared/types/ability-types/spells/sanctuary";
import SelfProjection from "@shared/types/ability-types/spells/self-projection";
import Shield from "@shared/types/ability-types/spells/shield";
import ShockingGrasp from "@shared/types/ability-types/spells/shocking-grasp";
import Slow from "@shared/types/ability-types/spells/slow";
import StoneSkin from "@shared/types/ability-types/spells/stone-skin";
import Summon from "@shared/types/ability-types/spells/summon";
import Teleport from "@shared/types/ability-types/spells/teleport";
import Ventriloquate from "@shared/types/ability-types/spells/ventriloquate";
import Waypoint from "@shared/types/ability-types/spells/waypoint";
import Weaken from "@shared/types/ability-types/spells/weaken";
import WordOfRecall from "@shared/types/ability-types/spells/word-of-recall";
import IAbility from "@shared/types/ability-types/ability";
import { IMortalClass, IClassType, MortalClass } from "@shared/types/character-types/class-type";
import IDslClass from "@shared/types/character-types/dslClass";
import IRace from "@shared/types/character-types/race-interface";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import DslArmorType from "@shared/types/item-types/armor-type";
import IDslArmorType from "@shared/types/item-types/armor-type-interface";
import Arboren from "@shared/types/race-types/arboren";
import Bugbear from "@shared/types/race-types/bugbear";
import Centaur from "@shared/types/race-types/centaur";
import DarkDwarf from "@shared/types/race-types/dark-dwarf";
import DarkElf from "@shared/types/race-types/dark-elf";
import DeepGnome from "@shared/types/race-types/deep-gnome";
import Felar from "@shared/types/race-types/felar";
import GiantOgre from "@shared/types/race-types/giant-ogre";
import Goblin from "@shared/types/race-types/goblin";
import HalfElf from "@shared/types/race-types/half-elf";
import HalfOgre from "@shared/types/race-types/half-ogre";
import HillDwarf from "@shared/types/race-types/hill-dwarf";
import HobGoblin from "@shared/types/race-types/hobgoblin";
import Human from "@shared/types/race-types/human";
import Kender from "@shared/types/race-types/kender";
import Minotaur from "@shared/types/race-types/minotaur";
import MountainDwarf from "@shared/types/race-types/mountain-dwarf";
import Mul from "@shared/types/race-types/mul";
import Ogre from "@shared/types/race-types/ogre";
import Pixie from "@shared/types/race-types/pixie";
import SeaElf from "@shared/types/race-types/sea-elf";
import ShalonestiElf from "@shared/types/race-types/shalonesti-elf";
import TinkerGnome from "@shared/types/race-types/tinker-gnome";
import Troll from "@shared/types/race-types/troll";
import Wemic from "@shared/types/race-types/wemic";
import WildElf from "@shared/types/race-types/wild-elf";
import Yinn from "@shared/types/race-types/yinn";
import CreateFood from "@shared/types/ability-types/spells/create-food";
import LocateObject from "@shared/types/ability-types/spells/locate-object";
import ServerCache from "@shared/cache/server-cache";

export class Bandit implements IDslClass, IMortalClass, IClassType {
    private static instance: Bandit;

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
    cpRacialModifiers: Map<IClassType, number>;
    isMoonAffected?: boolean | undefined;

    constructor() {
        this.id = MortalClass.Bandit.id;
        this.name = this.constructor.name;
        this.displayName = MortalClass.Bandit.displayName;
        this.isMortalClass = true;
        this.isReclass = true;
        this.isCsr = false;
        this.baseClass = MortalClass.Thief;
        this.classType = MortalClass.Bandit;
        this.imgUrl = "/img/classes/bandit.png";
        this.primaryAttribute = new StatAttribute({
            type: StatAttributeType.Dexterity
        });
        this.secondaryAttribute = new StatAttribute({
            type: StatAttributeType.Strength
        });
        this.armorType = DslArmorType.Studded;
        this.classGroup = this.baseClass.name;
        // Verified against ShatteredArchive 2025-02-19
        this.raceRestrictions = [
            Kender.GetInstance(),
            Arboren.GetInstance(),
            Troll.GetInstance(),
            Centaur.GetInstance(),
            Pixie.GetInstance()
        ];
        // Verified against ShatteredArchive 2025-02-19
        this.abilities = new Map<number, IAbility[]>([
            [2, [
              MagicMissile.GetInstance(),
              Ventriloquate.GetInstance()
            ]],
            [3, [DirtKicking.GetInstance()]],
            [5, [
              DetectMagic.GetInstance(),
              Riot.GetInstance()
            ]],
            [6, [
              ChillTouch.GetInstance(),
              ContinualLight.GetInstance(),
              DetectInvis.GetInstance(),
              Lore.GetInstance()
            ]],
            [7, [
              FloatingDisc.GetInstance(),
              PickLock.GetInstance()
            ]],
            [9, [
              DetectPoison.GetInstance(),
              Invisibility.GetInstance()
            ]],
            [10, [
              Armor.GetInstance(),
              BurningHands.GetInstance(),
              CreateRose.GetInstance(),
              Infravision.GetInstance(),
              Envenom.GetInstance(),
              Stealth.GetInstance()
            ]],
            [11, [
              Bash.GetInstance(),
              CreateFood.GetInstance(),
              LocateObject.GetInstance(),
            ]],
            [12, [
              CreateWater.GetInstance(),
              DetectEvil.GetInstance(),
              DetectGood.GetInstance(),
              DetectHidden.GetInstance(),
              Refresh.GetInstance(),
              Disarm.GetInstance(),
              SecondAttack.GetInstance()
            ]],
            [13, [
              CreateTree.GetInstance(),
              Parry.GetInstance()
            ]],
            [14, [
              ShockingGrasp.GetInstance(),
              Kick.GetInstance(),
              Riding.GetInstance()
            ]],
            [15, [
              Poison.GetInstance(),
              HandToHand.GetInstance(),
              Meditation.GetInstance(),
              Waylay.GetInstance()
            ]],
            [16, [
              Farsight.GetInstance(),
              Weaken.GetInstance(),
              WordOfRecall.GetInstance(),
              FastHealing.GetInstance(),
              Steal.GetInstance()
            ]],
            [17, [
              Blindness.GetInstance(),
              ProtectionEvil.GetInstance(),
              ProtectionNeutral.GetInstance(),
              ProtectionGood.GetInstance()
            ]],
            [18, [Identify.GetInstance()]],
            [19, [
              Fireproof.GetInstance(),
              Illumination.GetInstance()
            ]],
            [20, [
              Fly.GetInstance(),
              KnowAlignment.GetInstance(),
              Inspect.GetInstance()
            ]],
            [21, [Backstab.GetInstance()]],
            [22, [
              ColorSpray.GetInstance(),
              GiantStrength.GetInstance(),
              LightFoot.GetInstance()
            ]],
            [23, [
              CreateSpring.GetInstance(),
              BlindFighting.GetInstance()
            ]],
            [24, [ThirdAttack.GetInstance()]],
            [25, [
              PassDoor.GetInstance(),
              Teleport.GetInstance(),
              EnhancedDamage.GetInstance()
            ]],
            [26, [
              Curse.GetInstance(),
              EnergyDrain.GetInstance(),
              Haste.GetInstance()
            ]],
            [29, [
              Summon.GetInstance(),
              PanicEnemy.GetInstance()
            ]],
            [30, [
              DispelMagic.GetInstance(),
              Fireball.GetInstance(),
              Blizzard.GetInstance(),
              ProximityDispel.GetInstance()
            ]],
            [31, [MassInvis.GetInstance()]],
            [32, [Gate.GetInstance()]],
            [34, [Cancellation.GetInstance()]],
            [35, [
              AcidBlast.GetInstance(),
              Shield.GetInstance()
            ]],
            [36, [Plague.GetInstance()]],
            [37, [DualWield.GetInstance()]],
            [38, [
              PotionSmash.GetInstance(),
              SelfProjection.GetInstance()
            ]],
            [39, [
              ChainLightning.GetInstance(),
              Slow.GetInstance(),
              Waypoint.GetInstance()
            ]],
            [40, [StoneSkin.GetInstance()]],
            [42, [Sanctuary.GetInstance()]],
            [43, [Halt.GetInstance()]],
            [45, [Portal.GetInstance()]],
            [50, [Nexus.GetInstance()]]
          ]);
        // Verified against ShatteredArchive 2025-02-19
        this.characterCreationAbilityGroups = {
          [BanditBasics.GetInstance().name]: 0,
          [BanditDefault.GetInstance().name]: 40,
          [Weaponsmaster.GetInstance().name]: 40,
          [Detection.GetInstance().name]: 4,
          [Maladictions.GetInstance().name]: 8,
          [Combat.GetInstance().name]: 8,
          [Enhancement.GetInstance().name]: 7,
          [Protective.GetInstance().name]: 6,
          [Creation.GetInstance().name]: 5,
          [Illusion.GetInstance().name]: 5,
          [Transportation.GetInstance().name]: 6
        }

        // Verified against ShatteredArchive 2025-02-19
        this.characterCreationSkills = {
          [Axe.GetInstance().name]: 5,
          [Polearm.GetInstance().name]: 6,
          [Staff.GetInstance().name]: 3,
          [Bash.GetInstance().name]: 6,
          [Disarm.GetInstance().name]: 4,
          [EnhancedDamage.GetInstance().name]: 4,
          [Kick.GetInstance().name]: 4,
          [SecondAttack.GetInstance().name]: 3,
          [Haggle.GetInstance().name]: 3,
          [Peek.GetInstance().name]: 3,
          [Steal.GetInstance().name]: 6,
          [Halt.GetInstance().name]: 3,
          [PotionSmash.GetInstance().name]: 3,
          [Flail.GetInstance().name]: 6,
          [Spear.GetInstance().name]: 4,
          [Whip.GetInstance().name]: 5,
          [BlindFighting.GetInstance().name]: 4,
          [Dodge.GetInstance().name]: 3,
          [Envenom.GetInstance().name]: 3,
          [Parry.GetInstance().name]: 4,
          [ThirdAttack.GetInstance().name]: 8,
          [Lore.GetInstance().name]: 2,
          [PickLock.GetInstance().name]: 4,
          [PanicEnemy.GetInstance().name]: 3,
          [Waylay.GetInstance().name]: 2,
          [Stealth.GetInstance().name]: 4,
          [Mace.GetInstance().name]: 3,
          [Sword.GetInstance().name]: 3,
          [Backstab.GetInstance().name]: 6,
          [DirtKicking.GetInstance().name]: 3,
          [DualWield.GetInstance().name]: 9,
          [HandToHand.GetInstance().name]: 4,
          [Trip.GetInstance().name]: 3,
          [FastHealing.GetInstance().name]: 6,
          [Meditation.GetInstance().name]: 8,
          [Riding.GetInstance().name]: 5,
          [Riot.GetInstance().name]: 3,
          [Inspect.GetInstance().name]: 3
        }
        
        this.baseCpModifier = 3;
        this.castsAtLevel = false;
        this.isMoonAffected = false;
        this.castingLevelModifier = 0.66;
        // Verified against ShatteredArchive 2025-02-19
        this.cpRacialModifiers = new Map<IClassType, number>([
            [Human.GetInstance(), 1.0],
            [HalfElf.GetInstance(), 1.1],
            [WildElf.GetInstance(), 1.1],
            [ShalonestiElf.GetInstance(), 1.1],
            [SeaElf.GetInstance(), 1.1],
            [DarkElf.GetInstance(), 1.1],
            [HillDwarf.GetInstance(), 1.5],
            [MountainDwarf.GetInstance(), 1.4],
            [DarkDwarf.GetInstance(), 1.5],
            [Mul.GetInstance(), 1.5],
            [Ogre.GetInstance(), 2.0],
            [HalfOgre.GetInstance(), 1.75],
            [GiantOgre.GetInstance(), 3.0],
            [Goblin.GetInstance(), 1.0],
            [HobGoblin.GetInstance(), 1.0],
            [Bugbear.GetInstance(), 1.0],
            [TinkerGnome.GetInstance(), 1.3],
            [DeepGnome.GetInstance(), 1.3],
            [Felar.GetInstance(), 1.15],
            [Wemic.GetInstance(), 2.0],
            [Minotaur.GetInstance(), 1.5],
            [Yinn.GetInstance(), 1.6]
          ])
        this.helpfile = `Bandits are often vicious, cunning, and cruel.  They are ""cut throat"" even
with their own kind generally, but a common goal of obtaining loot or the
big score makes them more than willing to work in well organized groups.  

Bandits are excellent fighters and keep all of the skills of a thief.  
 
Who can be a Bandit?
 
CLASS:     THIEVES only
RACE:      ALL EXCEPT KENDER
ALIGNMENT: Any alignment
CLAN:      ANY, including non-clanned
See also - RECLASS`
    }
    
    // Method to get the single instance of the class
    public static GetInstance(): Bandit {
    if (!Bandit.instance) {
        Bandit.instance = new Bandit();
        ServerCache.Classes[this.instance.name] = this.instance;
    }
    return Bandit.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
    return Bandit.GetInstance() as T;
    }
}

export default Bandit;