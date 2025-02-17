// #region imports
import Flail from "@shared/types/ability-types/skills/flail";
import Staff from "@shared/types/ability-types/skills/staff";
import Riding from "@shared/types/ability-types/skills/riding";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Kick from "@shared/types/ability-types/skills/kick";
import BlindFighting from "@shared/types/ability-types/skills/blind-fighting";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import Parry from "@shared/types/ability-types/skills/parry";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Lore from "@shared/types/ability-types/skills/lore";
import Haggle from "@shared/types/ability-types/skills/haggle";
import Peek from "@shared/types/ability-types/skills/peek";
import Meditation from "@shared/types/ability-types/skills/meditation";
import PickLock from "@shared/types/ability-types/skills/pick-lock";
import FastHealing from "@shared/types/ability-types/skills/fast-healing";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Mace from "@shared/types/ability-types/skills/mace";
import Polearm from "@shared/types/ability-types/skills/polearm";
import Spear from "@shared/types/ability-types/skills/spear";
import Sword from "@shared/types/ability-types/skills/sword";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Summon from "@shared/types/ability-types/spells/summon";
import Swim from "@shared/types/ability-types/skills/swim";
import Scrolls from "@shared/types/ability-types/skills/scrolls";
import Staves from "@shared/types/ability-types/skills/staves";
import Wands from "@shared/types/ability-types/skills/wands";
import Recall from "@shared/types/ability-types/skills/recall";
import Dig from "@shared/types/ability-types/skills/dig";
import Age from "@shared/types/ability-types/skills/age";
import Armor from "@shared/types/ability-types/spells/armor";
import Refresh from "@shared/types/ability-types/spells/refresh";
import ProtectionEvil from "@shared/types/ability-types/spells/protection-evil";
import ProtectionNeutral from "@shared/types/ability-types/spells/protection-neutral";
import ProtectionGood from "@shared/types/ability-types/spells/protection-good";
import WordOfRecall from "@shared/types/ability-types/spells/word-of-recall";
import Fireproof from "@shared/types/ability-types/spells/fireproof";
import Fly from "@shared/types/ability-types/spells/fly";
import Gate from "@shared/types/ability-types/spells/gate";
import Sanctuary from "@shared/types/ability-types/spells/sanctuary";
import Shield from "@shared/types/ability-types/spells/shield";
import Cancellation from "@shared/types/ability-types/spells/cancellation";
import Teleport from "@shared/types/ability-types/spells/teleport";
import PassDoor from "@shared/types/ability-types/spells/pass-door";
import Waypoint from "@shared/types/ability-types/spells/waypoint";
import Portal from "@shared/types/ability-types/spells/portal";
import Nexus from "@shared/types/ability-types/spells/nexus";
import StoneSkin from "@shared/types/ability-types/spells/stone-skin";
import BarkSkin from "@shared/types/ability-types/spells/bark-skin";
import Bless from "@shared/types/ability-types/spells/bless";
import Frenzy from "@shared/types/ability-types/spells/frenzy";
import NatureGrowth from "@shared/types/ability-types/spells/nature-growth";
import Imbue from "@shared/types/ability-types/spells/imbue";
import DetectGood from "@shared/types/ability-types/spells/detect-good";
import DetectEvil from "@shared/types/ability-types/spells/detect-evil";
import DetectInvis from "@shared/types/ability-types/spells/detect-invis";
import DetectHidden from "@shared/types/ability-types/spells/detect-hidden";
import DetectMagic from "@shared/types/ability-types/spells/detect-magic";
import AcuteVision from "@shared/types/ability-types/skills/acute-vision";
import Astrology from "@shared/types/ability-types/skills/astrology";
import Creaturelore from "@shared/types/ability-types/skills/creaturelore";
import DarkVision from "@shared/types/ability-types/skills/dark-vision";
import FindWater from "@shared/types/ability-types/skills/find-water";
import Herbal from "@shared/types/ability-types/skills/herbal";
import Hide from "@shared/types/ability-types/skills/hide";
import Pugil from "@shared/types/ability-types/skills/pugil";
import Sneak from "@shared/types/ability-types/skills/sneak";
import Tame from "@shared/types/ability-types/skills/tame";
import Blindness from "@shared/types/ability-types/spells/blindness";
import Blizzard from "@shared/types/ability-types/spells/blizzard";
import CallLightning from "@shared/types/ability-types/spells/call-lightning";
import CallWild from "@shared/types/ability-types/spells/call-wild";
import Calm from "@shared/types/ability-types/spells/calm";
import CauseCritical from "@shared/types/ability-types/spells/cause-critical";
import CauseDecay from "@shared/types/ability-types/spells/cause-decay";
import CauseFatality from "@shared/types/ability-types/spells/cause-fatality";
import CauseLight from "@shared/types/ability-types/spells/cause-light";
import CauseSerious from "@shared/types/ability-types/spells/cause-serious";
import ContinualLight from "@shared/types/ability-types/spells/continual-light";
import ControlWeather from "@shared/types/ability-types/spells/control-weather";
import CreateFood from "@shared/types/ability-types/spells/create-food";
import CreateRose from "@shared/types/ability-types/spells/create-rose";
import CreateSpring from "@shared/types/ability-types/spells/create-spring";
import CreateTree from "@shared/types/ability-types/spells/create-tree";
import CreateWater from "@shared/types/ability-types/spells/create-water";
import CureBlindness from "@shared/types/ability-types/spells/cure-blindness";
import CureCritical from "@shared/types/ability-types/spells/cure-critical";
import CureDisease from "@shared/types/ability-types/spells/cure-disease";
import CureLight from "@shared/types/ability-types/spells/cure-light";
import CurePoison from "@shared/types/ability-types/spells/cure-poison";
import CureSerious from "@shared/types/ability-types/spells/cure-serious";
import Curse from "@shared/types/ability-types/spells/curse";
import Demonfire from "@shared/types/ability-types/spells/demonfire";
import DetectPoison from "@shared/types/ability-types/spells/detect-poison";
import DispelEvil from "@shared/types/ability-types/spells/dispel-evil";
import DispelFog from "@shared/types/ability-types/spells/dispel-fog";
import DispelGood from "@shared/types/ability-types/spells/dispel-good";
import DispelMagic from "@shared/types/ability-types/spells/dispel-magic";
import DispelNeutral from "@shared/types/ability-types/spells/dispel-neutral";
import Earthquake from "@shared/types/ability-types/spells/earthquake";
import EnergyDrain from "@shared/types/ability-types/spells/energy-drain";
import EnhanceSeed from "@shared/types/ability-types/spells/enhance-seed";
import Entangle from "@shared/types/ability-types/spells/entangle";
import FaerieFog from "@shared/types/ability-types/spells/faerie-fog";
import Farsight from "@shared/types/ability-types/spells/farsight";
import Firestorm from "@shared/types/ability-types/spells/firestorm";
import Flamestrike from "@shared/types/ability-types/spells/flamestrike";
import FloatingDisc from "@shared/types/ability-types/spells/floating-disc";
import Fog from "@shared/types/ability-types/spells/fog";
import Harm from "@shared/types/ability-types/spells/harm";
import Heal from "@shared/types/ability-types/spells/heal";
import HeatMetal from "@shared/types/ability-types/spells/heat-metal";
import HolyWord from "@shared/types/ability-types/spells/holy-word";
import Identify from "@shared/types/ability-types/spells/identify";
import Illumination from "@shared/types/ability-types/spells/illumination";
import KnowAlignment from "@shared/types/ability-types/spells/know-alignment";
import LightningBolt from "@shared/types/ability-types/spells/lightning-bolt";
import LocateObject from "@shared/types/ability-types/spells/locate-object";
import MassHealing from "@shared/types/ability-types/spells/mass-healing";
import Plague from "@shared/types/ability-types/spells/plague";
import Poison from "@shared/types/ability-types/spells/poison";
import ProtectionCold from "@shared/types/ability-types/spells/protection-cold";
import ProtectionFire from "@shared/types/ability-types/spells/protection-fire";
import ProximityDispel from "@shared/types/ability-types/spells/proximity-dispel";
import RayOfTruth from "@shared/types/ability-types/spells/ray-of-truth";
import RemoveCurse from "@shared/types/ability-types/spells/remove-curse";
import Slow from "@shared/types/ability-types/spells/slow";
import SummonElemental from "@shared/types/ability-types/spells/summon-elemental";
import Swarm from "@shared/types/ability-types/spells/swarm";
import Tornado from "@shared/types/ability-types/spells/tornado";
import Weaken from "@shared/types/ability-types/spells/weaken";
import WrathOfNature from "@shared/types/ability-types/spells/wrath-of-nature";
import FaerieFire from "@shared/types/ability-types/spells/faerie-fire";
import DruidBasics from "@shared/types/ability-types/groups-class/druid-basics";
import Weaponsmaster from "@shared/types/ability-types/groups-skills/weaponsmaster";
import Attack from "@shared/types/ability-types/groups-spells/attack";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Creation from "@shared/types/ability-types/groups-spells/creation";
import Curative from "@shared/types/ability-types/groups-spells/curative";
import Detection from "@shared/types/ability-types/groups-spells/detection";
import Elemental from "@shared/types/ability-types/groups-spells/elemental";
import Harmful from "@shared/types/ability-types/groups-spells/harmful";
import Healing from "@shared/types/ability-types/groups-spells/healing";
import Maladictions from "@shared/types/ability-types/groups-spells/maladictions";
import Nature from "@shared/types/ability-types/groups-spells/nature";
import Protective from "@shared/types/ability-types/groups-spells/protective";
import Transportation from "@shared/types/ability-types/groups-spells/transportation";
import Weather from "@shared/types/ability-types/groups-spells/weather";
import DruidDefault from "@shared/types/ability-types/groups-class/druid-default";
import IAbility from "@shared/types/ability-types/ability";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import { IMortalClass, IClassType, MortalClass } from "@shared/types/character-types/class-type";
import IDslClass from "@shared/types/character-types/dslClass";
import IRace from "@shared/types/character-types/race-interface";
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import DslArmorType from "@shared/types/item-types/armor-type";
import IDslArmorType from "@shared/types/item-types/armor-type-interface";
import Arboren from "@shared/types/race-types/arboren";
import Bugbear from "@shared/types/race-types/bugbear";
import DarkDwarf from "@shared/types/race-types/dark-dwarf";
import DarkElf from "@shared/types/race-types/dark-elf";
import DeepGnome from "@shared/types/race-types/deep-gnome";
import Felar from "@shared/types/race-types/felar";
import GiantOgre from "@shared/types/race-types/giant-ogre";
import Goblin from "@shared/types/race-types/goblin";
import GullyDwarf from "@shared/types/race-types/gully-dwarf";
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
import Wemic from "@shared/types/race-types/wemic";
import WildElf from "@shared/types/race-types/wild-elf";
import Yinn from "@shared/types/race-types/yinn";
// #endregion

export class Druid implements IDslClass, IMortalClass, IClassType {
    private static instance: Druid;

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
    characterCreationAbilityGroups: Map<number, IAbilityGroup[]>;
    characterCreationSkills: Map<number, IAbility[]>;
    baseCpModifier: number;
    helpfile: string;
    castsAtLevel: boolean;
    castingLevelModifier: number;
    notes?: string;
    cpRacialModifiers: Map<IClassType, number>;
    buffActions?: IAbility[] | undefined;

    constructor() {
        this.id = MortalClass.Druid.id;
        this.name = MortalClass.Druid.name;
        this.displayName = MortalClass.Druid.displayName;
        this.isMortalClass = true;
        this.isReclass = true;
        this.isCsr = false;
        this.baseClass = MortalClass.Cleric;
        this.classType = MortalClass.Druid;
        this.imgUrl = "/img/classes/druid.png";
        this.primaryAttribute = new StatAttribute({
            type: StatAttributeType.Wisdom
        });
        this.secondaryAttribute = new StatAttribute({
            type: StatAttributeType.Dexterity
        });
        this.armorType = DslArmorType.Leather;
        this.classGroup = this.baseClass.name;
        this.abilities = new Map<number, IAbility[]>([
            [1, [
                Dagger.GetInstance(), Flail.GetInstance(), Mace.GetInstance(), Polearm.GetInstance(), ShieldBlock.GetInstance(), 
                Spear.GetInstance(), Sword.GetInstance(), Staff.GetInstance(), Swim.GetInstance(), Scrolls.GetInstance(), 
                Staves.GetInstance(), Wands.GetInstance(), Recall.GetInstance(), Dig.GetInstance(), Herbal.GetInstance(), 
                Age.GetInstance(), CauseLight.GetInstance(), CureLight.GetInstance()]],
    [2, [Armor.GetInstance()]],
    [3, [CreateWater.GetInstance(), FaerieFire.GetInstance(), Riding.GetInstance()]],
    [4, [ContinualLight.GetInstance(), DetectEvil.GetInstance(), DetectGood.GetInstance()]],
    [5, [CreateFood.GetInstance(), Refresh.GetInstance(), WordOfRecall.GetInstance()]],
    [6, [CureBlindness.GetInstance(), DetectMagic.GetInstance(), Meditation.GetInstance()]],
    [7, [Bless.GetInstance(), CauseSerious.GetInstance(), CureSerious.GetInstance(), DetectPoison.GetInstance(), Illumination.GetInstance()]],
    [8, [Blindness.GetInstance(), DetectInvis.GetInstance()]],
    [9, [KnowAlignment.GetInstance(), ProtectionEvil.GetInstance(), ProtectionNeutral.GetInstance(), ProtectionGood.GetInstance(), FastHealing.GetInstance()]],
    [10, [Earthquake.GetInstance(), FloatingDisc.GetInstance(), CreateTree.GetInstance(), HandToHand.GetInstance()]],
    [11, [CreateRose.GetInstance(), DetectHidden.GetInstance(), NatureGrowth.GetInstance()]],
    [12, [Fireproof.GetInstance(), Poison.GetInstance(), Summon.GetInstance(), FindWater.GetInstance()]],
    [13, [CauseCritical.GetInstance(), CureCritical.GetInstance(), CureDisease.GetInstance()]],
    [14, [CurePoison.GetInstance(), Weaken.GetInstance(), Kick.GetInstance()]],
    [15, [DispelEvil.GetInstance(), DispelNeutral.GetInstance(), DispelGood.GetInstance(), LocateObject.GetInstance(), DarkVision.GetInstance()]],
    [16, [Calm.GetInstance(), Farsight.GetInstance(), HeatMetal.GetInstance(), Identify.GetInstance(), Lore.GetInstance()]],
    [17, [CreateSpring.GetInstance(), Gate.GetInstance(), Plague.GetInstance(), Tame.GetInstance()]],
    [18, [CallLightning.GetInstance(), Curse.GetInstance(), Fly.GetInstance(), RemoveCurse.GetInstance(), EnhanceSeed.GetInstance(), Haggle.GetInstance(), Hide.GetInstance()]],
    [19, [ControlWeather.GetInstance(), BarkSkin.GetInstance()]],
    [20, [Tornado.GetInstance(), Flamestrike.GetInstance(), Sanctuary.GetInstance(), Astrology.GetInstance(), Parry.GetInstance()]],
    [21, [FaerieFog.GetInstance(), Heal.GetInstance(), Peek.GetInstance()]],
    [22, [EnergyDrain.GetInstance(), Teleport.GetInstance(), Dodge.GetInstance()]],
    [23, [Harm.GetInstance(), LightningBolt.GetInstance()]],
    [24, [DispelMagic.GetInstance(), Frenzy.GetInstance(), Waypoint.GetInstance(), ProximityDispel.GetInstance(), BlindFighting.GetInstance(), SecondAttack.GetInstance()]],
    [26, [Cancellation.GetInstance(), Sneak.GetInstance(), Creaturelore.GetInstance(), PickLock.GetInstance()]],
    [29, [Pugil.GetInstance(), AcuteVision.GetInstance()]],
    [30, [Portal.GetInstance(), ProtectionCold.GetInstance(), ProtectionFire.GetInstance(), CallWild.GetInstance(), EnhancedDamage.GetInstance()]],
    [31, [WrathOfNature.GetInstance()]],
    [32, [PassDoor.GetInstance(), Fog.GetInstance(), DispelFog.GetInstance()]],
    [34, [Demonfire.GetInstance(), Entangle.GetInstance()]],
    [35, [Nexus.GetInstance(), RayOfTruth.GetInstance(), Shield.GetInstance()]],
    [36, [HolyWord.GetInstance()]],
    [37, [CauseDecay.GetInstance()]],
    [38, [MassHealing.GetInstance(), Swarm.GetInstance()]],
    [40, [Slow.GetInstance(), StoneSkin.GetInstance()]],
    [41, [SummonElemental.GetInstance()]],
    [42, [Imbue.GetInstance()]],
    [43, [Blizzard.GetInstance()]],
    [45, [CauseFatality.GetInstance()]],
    [47, [Firestorm.GetInstance()]]
        ]);
        
        this.characterCreationAbilityGroups = new Map<number, IAbilityGroup[]>([
            [0, [DruidBasics.GetInstance()]],
            [3, [Detection.GetInstance(), Healing.GetInstance(), Nature.GetInstance(), Elemental.GetInstance(), Harmful.GetInstance()]],
            [4, [Benedictions.GetInstance(), Creation.GetInstance(), Transportation.GetInstance(), Curative.GetInstance(), Protective.GetInstance(), Weather.GetInstance()]],
            [5, [Maladictions.GetInstance(), Attack.GetInstance()]],
            [20, [Weaponsmaster.GetInstance()]],
            [40, [DruidDefault.GetInstance()]]
        ]);

        this.characterCreationSkills = new Map<number, IAbility[]>([
            [2, [Dagger.GetInstance(), FindWater.GetInstance(), Riding.GetInstance(), Creaturelore.GetInstance()]],
            [3, [DarkVision.GetInstance(), Mace.GetInstance(), Tame.GetInstance()]],
            [4, [Flail.GetInstance(), Lore.GetInstance(), Spear.GetInstance()]],
            [5, [AcuteVision.GetInstance(), HandToHand.GetInstance(), FastHealing.GetInstance(), Meditation.GetInstance()]],
            [6, [Polearm.GetInstance(), Sword.GetInstance(), ShieldBlock.GetInstance(), BlindFighting.GetInstance(), Kick.GetInstance()]],
            [7, [Astrology.GetInstance(), Hide.GetInstance(), Peek.GetInstance(), Sneak.GetInstance()]],
            [8, [Parry.GetInstance(), Pugil.GetInstance(), PickLock.GetInstance(), Dodge.GetInstance(), SecondAttack.GetInstance(), Haggle.GetInstance()]],
            [9, [EnhancedDamage.GetInstance()]]
        ]);
        
        this.raceRestrictions = [
            HobGoblin.GetInstance(),
            Bugbear.GetInstance(),
            Goblin.GetInstance(),
            MountainDwarf.GetInstance(),
            DarkDwarf.GetInstance(),
            GullyDwarf.GetInstance(),
            Pixie.GetInstance()
         ];
        this.baseCpModifier = 3;
        this.helpfile = 
        `help druid
DRUIDS
DRUIDS
Druids are a nature based class. They worship trees, animals and all that
surrounds them made of nature. They are more similar to Rangers than any
other class, but they cast at their level and are VERY deadly in the proper
sectors.
Who can be a Druid?
CLASS:     CLERICS only
RACE:      HUMANS and ELVES.
ALIGNMENT: ANY
CLAN:      ANY
 
See Also:  'RECLASS'`;
        this.castsAtLevel = true;
        this.castingLevelModifier = 1.00;
        this.notes = "";
        this.cpRacialModifiers = new Map<IRace, number>([
            [Human.GetInstance(), 1.0],
            [HalfElf.GetInstance(), 1.4],
            [WildElf.GetInstance(), 1.3],
            [ShalonestiElf.GetInstance(), 1.4],
            [SeaElf.GetInstance(), 1.4],
            [DarkElf.GetInstance(), 1.4],
            [HillDwarf.GetInstance(), 1.5],
            [Mul.GetInstance(), 1.5],
            [Ogre.GetInstance(), 1.4],
            [HalfOgre.GetInstance(), 1.0],
            [GiantOgre.GetInstance(), 1.6],
            [TinkerGnome.GetInstance(), 1.25],
            [DeepGnome.GetInstance(), 1.25],
            [Felar.GetInstance(), 1.0],
            [Wemic.GetInstance(), 1.0],
            [Minotaur.GetInstance(), 1.5],
            [Kender.GetInstance(), 1.4],
            [Arboren.GetInstance(), 1.0],
            [Yinn.GetInstance(), 1.6],
        ]);
        this.buffActions = [
            // Protections
            Sanctuary.GetInstance(),
            StoneSkin.GetInstance(),
            Shield.GetInstance(),
            BarkSkin.GetInstance(),
            Bless.GetInstance(),
            Frenzy.GetInstance(),
            // Misc
            PassDoor.GetInstance(),
            NatureGrowth.GetInstance(),
            Imbue.GetInstance(),
            // Detects
            DetectGood.GetInstance(),
            DetectEvil.GetInstance(),
            DetectInvis.GetInstance(),
            DetectHidden.GetInstance(),
            DetectMagic.GetInstance(),
        ]
    }

    // Method to get the single instance of the class
    public static GetInstance(): Druid {
        if (!Druid.instance) {
            Druid.instance = new Druid();
        }
        return Druid.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Druid.GetInstance() as T;
    }
}

export default Druid;