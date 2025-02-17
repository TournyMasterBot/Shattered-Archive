// #region imports
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import DslArmorType from "../item-types/armor-type";
import IDslArmorType from "../item-types/armor-type-interface";
import { Weaponsmaster } from "@shared/types/ability-types/groups-skills/weaponsmaster";
import IRace from "@shared/types/character-types/race-interface";
import ArmsmanBasics from "@shared/types/ability-types/groups-class/armsman-basics";
import Axe from "@shared/types/ability-types/skills/axe";
import MasteryMace from "@shared/types/ability-types/groups-skills/mastery-mace";
import MasterySword from "@shared/types/ability-types/groups-skills/mastery-sword";
import MasteryDagger from "@shared/types/ability-types/groups-skills/mastery-dagger";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import MasteryPolearm from "@shared/types/ability-types/groups-skills/mastery-polearm";
import MasteryWhip from "@shared/types/ability-types/groups-skills/mastery-whip";
import MasteryFlail from "@shared/types/ability-types/groups-skills/mastery-flail";
import MasterySpear from "@shared/types/ability-types/groups-skills/mastery-spear";
import MasteryAxe from "@shared/types/ability-types/groups-skills/mastery-axe";
import ArmsmanDefault from "@shared/types/ability-types/groups-class/armsman-default";
import Transportation from "@shared/types/ability-types/groups-spells/transportation";
import Flail from "@shared/types/ability-types/skills/flail";
import Whip from "@shared/types/ability-types/skills/whip";
import Staff from "@shared/types/ability-types/skills/staff";
import Riding from "@shared/types/ability-types/skills/riding";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Kick from "@shared/types/ability-types/skills/kick";
import Grip from "@shared/types/ability-types/skills/grip";
import BlindFighting from "@shared/types/ability-types/skills/blind-fighting";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import Bash from "@shared/types/ability-types/skills/bash";
import DirtKicking from "@shared/types/ability-types/skills/dirt-kicking";
import Parry from "@shared/types/ability-types/skills/parry";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Lore from "@shared/types/ability-types/skills/lore";
import Disarm from "@shared/types/ability-types/skills/disarm";
import Berserk from "@shared/types/ability-types/skills/berserk";
import Charge from "@shared/types/ability-types/skills/charge";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import DualWield from "@shared/types/ability-types/skills/dual-wield";
import EnhancedReactions from "@shared/types/ability-types/skills/enhanced-reactions";
import Haggle from "@shared/types/ability-types/skills/haggle";
import Peek from "@shared/types/ability-types/skills/peek";
import FourthAttack from "@shared/types/ability-types/skills/fourth-attack";
import Trip from "@shared/types/ability-types/skills/trip";
import Meditation from "@shared/types/ability-types/skills/meditation";
import PickLock from "@shared/types/ability-types/skills/pick-lock";
import FastHealing from "@shared/types/ability-types/skills/fast-healing";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Mace from "@shared/types/ability-types/skills/mace";
import Polearm from "@shared/types/ability-types/skills/polearm";
import Spear from "@shared/types/ability-types/skills/spear";
import Sword from "@shared/types/ability-types/skills/sword";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Backhand from "@shared/types/ability-types/skills/backhand";
import Summon from "@shared/types/ability-types/spells/summon";
import Sting from "@shared/types/ability-types/skills/sting";
import Rescue from "@shared/types/ability-types/skills/rescue";
import Swim from "@shared/types/ability-types/skills/swim";
import Scrolls from "@shared/types/ability-types/skills/scrolls";
import Staves from "@shared/types/ability-types/skills/staves";
import Wands from "@shared/types/ability-types/skills/wands";
import Recall from "@shared/types/ability-types/skills/recall";
import Dig from "@shared/types/ability-types/skills/dig";
import Age from "@shared/types/ability-types/skills/age";
import Armor from "@shared/types/ability-types/spells/armor";
import Stab from "@shared/types/ability-types/skills/stab";
import Refresh from "@shared/types/ability-types/spells/refresh";
import Distance from "@shared/types/ability-types/skills/distance";
import Spin from "@shared/types/ability-types/skills/spin";
import ProtectionEvil from "@shared/types/ability-types/spells/protection-evil";
import ProtectionNeutral from "@shared/types/ability-types/spells/protection-neutral";
import ProtectionGood from "@shared/types/ability-types/spells/protection-good";
import Disembowel from "@shared/types/ability-types/skills/disembowel";
import WordOfRecall from "@shared/types/ability-types/spells/word-of-recall";
import Yank from "@shared/types/ability-types/skills/yank";
import Fireproof from "@shared/types/ability-types/spells/fireproof";
import Fly from "@shared/types/ability-types/spells/fly";
import LightFoot from "@shared/types/ability-types/spells/light-foot";
import Gate from "@shared/types/ability-types/spells/gate";
import Haste from "@shared/types/ability-types/spells/haste";
import Sanctuary from "@shared/types/ability-types/spells/sanctuary";
import Shield from "@shared/types/ability-types/spells/shield";
import Cancellation from "@shared/types/ability-types/spells/cancellation";
import Teleport from "@shared/types/ability-types/spells/teleport";
import PassDoor from "@shared/types/ability-types/spells/pass-door";
import Waypoint from "@shared/types/ability-types/spells/waypoint";
import Portal from "@shared/types/ability-types/spells/portal";
import Entwine from "@shared/types/ability-types/skills/entwine";
import Hurl from "@shared/types/ability-types/skills/hurl";
import Impale from "@shared/types/ability-types/skills/impale";
import Nexus from "@shared/types/ability-types/spells/nexus";
import StoneSkin from "@shared/types/ability-types/spells/stone-skin";
import GiantStrength from "@shared/types/ability-types/spells/giant-strength";
import Infravision from "@shared/types/ability-types/spells/infravision";
import { IClassType, IMortalClass, MortalClass } from "@shared/types/character-types/class-type";
import IDslClass from "@shared/types/character-types/dslClass";
import IAbility from "@shared/types/ability-types/ability";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import Pixie from "@shared/types/race-types/pixie";
import Human from "@shared/types/race-types/human";
import HalfElf from "@shared/types/race-types/half-elf";
import Arboren from "@shared/types/race-types/arboren";
import Bugbear from "@shared/types/race-types/bugbear";
import DarkDwarf from "@shared/types/race-types/dark-dwarf";
import DarkElf from "@shared/types/race-types/dark-elf";
import DeepGnome from "@shared/types/race-types/deep-gnome";
import Felar from "@shared/types/race-types/felar";
import GiantOgre from "@shared/types/race-types/giant-ogre";
import Goblin from "@shared/types/race-types/goblin";
import HalfOgre from "@shared/types/race-types/half-ogre";
import HillDwarf from "@shared/types/race-types/hill-dwarf";
import Kender from "@shared/types/race-types/kender";
import Minotaur from "@shared/types/race-types/minotaur";
import MountainDwarf from "@shared/types/race-types/mountain-dwarf";
import Mul from "@shared/types/race-types/mul";
import Ogre from "@shared/types/race-types/ogre";
import SeaElf from "@shared/types/race-types/sea-elf";
import ShalonestiElf from "@shared/types/race-types/shalonesti-elf";
import TinkerGnome from "@shared/types/race-types/tinker-gnome";
import Wemic from "@shared/types/race-types/wemic";
import WildElf from "@shared/types/race-types/wild-elf";
import Yinn from "@shared/types/race-types/yinn";
import HobGoblin from "@shared/types/race-types/hobgoblin";
// #endregion

export class Armsman implements IDslClass, IMortalClass, IClassType {
    private static instance: Armsman;

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

    constructor() {
        this.id = MortalClass.Armsman.id;
        this.name = MortalClass.Armsman.name;
        this.displayName = MortalClass.Armsman.displayName;
        this.isMortalClass = true;
        this.isReclass = true;
        this.isCsr = false;
        this.baseClass = MortalClass.Warrior;
        this.classType = MortalClass.Armsman;
        this.imgUrl = "/img/classes/armsman.png";
        this.primaryAttribute = new StatAttribute({
            type: StatAttributeType.Strength
        });
        this.secondaryAttribute = new StatAttribute({
            type: StatAttributeType.Constitution
        });
        this.armorType = DslArmorType.Plate;
        this.classGroup = this.baseClass.name;
        this.abilities = new Map<number, IAbility[]>([
            [1, [
                Axe.GetInstance().Get(),
                Dagger.GetInstance().Get(),
                Flail.GetInstance().Get(),
                Mace.GetInstance().Get(),
                Polearm.GetInstance().Get(),
                ShieldBlock.GetInstance().Get(),
                Spear.GetInstance().Get(),
                Sword.GetInstance().Get(),
                Staff.GetInstance().Get(),
                Whip.GetInstance().Get(),
                Bash.GetInstance().Get(),
                EnhancedDamage.GetInstance().Get(),
                Parry.GetInstance().Get(),
                Rescue.GetInstance().Get(),
                Swim.GetInstance().Get(),
                Scrolls.GetInstance().Get(),
                Staves.GetInstance().Get(),
                Wands.GetInstance().Get(),
                Recall.GetInstance().Get(),
                Dig.GetInstance().Get(),
                Age.GetInstance().Get()
            ]],
            [2, [Riding.GetInstance().Get()]],
            [3, [DirtKicking.GetInstance().Get()]],
            [5, [
                SecondAttack.GetInstance().Get(),
                Armor.GetInstance().Get()
            ]],
            [6, [
                HandToHand.GetInstance().Get(),
                FastHealing.GetInstance().Get()
            ]],
            [8, [
                Kick.GetInstance().Get(),
                Stab.GetInstance().Get()
            ]],
            [9, [
                Refresh.GetInstance().Get()
            ]],
            [10, [
                Backhand.GetInstance().Get(),
                Distance.GetInstance().Get()
            ]],
            [11, [
                Disarm.GetInstance().Get(),
                Spin.GetInstance().Get(),
                ProtectionEvil.GetInstance().Get(),
                ProtectionNeutral.GetInstance().Get(),
                ProtectionGood.GetInstance().Get()
            ]],
            [12, [
                ThirdAttack.GetInstance().Get(),
                Disembowel.GetInstance().Get()
            ]],
            [13, [
                BlindFighting.GetInstance().Get(),
                Dodge.GetInstance().Get(),
                Infravision.GetInstance().Get(),
                WordOfRecall.GetInstance().Get()
            ]],
            [14, [
                Haggle.GetInstance().Get(),
                Peek.GetInstance().Get()
            ]],
            [15, [
                Trip.GetInstance().Get(),
                Meditation.GetInstance().Get()
            ]],
            [16, [
                Yank.GetInstance().Get(),
                Grip.GetInstance().Get(),
                Fireproof.GetInstance().Get()
            ]],
            [18, [Berserk.GetInstance().Get(), GiantStrength.GetInstance().Get()]],
            [19, [Charge.GetInstance().Get()]],
            [20, [
                Lore.GetInstance().Get(),
                Sting.GetInstance().Get()
            ]],
            [21, [EnhancedReactions.GetInstance().Get()]],
            [22, [
                DualWield.GetInstance().Get(),
                Fly.GetInstance().Get(),
                Summon.GetInstance().Get(),
                LightFoot.GetInstance().Get()
            ]],
            [28, [Gate.GetInstance().Get()]],
            [29, [Haste.GetInstance().Get()]],
            [30, [
                Sanctuary.GetInstance().Get(),
                Shield.GetInstance().Get()
            ]],
            [34, [Cancellation.GetInstance().Get()]],
            [36, [Teleport.GetInstance().Get()]],
            [37, [PassDoor.GetInstance().Get()]],
            [39, [Waypoint.GetInstance().Get()]],
            [40, [Portal.GetInstance().Get()]],
            [43, [Entwine.GetInstance().Get()]],
            [44, [Hurl.GetInstance().Get()]],
            [45, [
                Impale.GetInstance().Get(),
                Nexus.GetInstance().Get(),
                StoneSkin.GetInstance().Get()
            ]]
        ]);
        this.characterCreationAbilityGroups = new Map<number, IAbilityGroup[]>([
            [0, [ArmsmanBasics.GetInstance().Get()]],
            [8, [new Transportation()]],
            [9, [
                MasteryMace.GetInstance().Get(),
                MasterySword.GetInstance().Get(),
                MasteryDagger.GetInstance().Get(),
                Enhancement.GetInstance().Get(),
                MasteryPolearm.GetInstance().Get(),
                MasteryWhip.GetInstance().Get(),
                MasteryFlail.GetInstance().Get(),
                MasterySpear.GetInstance().Get(),
                MasteryAxe.GetInstance().Get()
            ]],
            [20, [Weaponsmaster.GetInstance().Get()]],
            [40, [ArmsmanDefault.GetInstance().Get()]]
        ]);
        this.characterCreationSkills = new Map<number, IAbility[]>([
            [2, [Riding.GetInstance().Get(), ShieldBlock.GetInstance().Get()]],
            [3, [
                Axe.GetInstance().Get(),
                Kick.GetInstance().Get(),
                Grip.GetInstance().Get(),
                BlindFighting.GetInstance().Get(),
                EnhancedDamage.GetInstance().Get()
            ]],
            [4, [
                Bash.GetInstance().Get(),
                DirtKicking.GetInstance().Get(),
                Parry.GetInstance().Get(),
                Flail.GetInstance().Get(),
                Whip.GetInstance().Get(),
                HandToHand.GetInstance().Get(),
                Dodge.GetInstance().Get(),
                Lore.GetInstance().Get(),
                Disarm.GetInstance().Get()
            ]],
            [5, [
                Berserk.GetInstance().Get(),
                Charge.GetInstance().Get(),
                ThirdAttack.GetInstance().Get()
            ]],
            [6, [
                DualWield.GetInstance().Get(),
                Staff.GetInstance().Get(),
                EnhancedReactions.GetInstance().Get(),
                Haggle.GetInstance().Get(),
                Peek.GetInstance().Get(),
                FourthAttack.GetInstance().Get()
            ]],
            [8, [
                Trip.GetInstance().Get(),
                Meditation.GetInstance().Get(),
                PickLock.GetInstance().Get()
            ]],
            [10, [
                FastHealing.GetInstance().Get()
            ]]
        ]);
        this.raceRestrictions = [
            Pixie.GetInstance()
         ];
        this.baseCpModifier = 3;
        this.helpfile = 
        `help armsman
        armsman armsmen armswoman armswomen
        The basic man of arms from the legends.  The Armsman can, and will, do
        anything necessary to win a fight.  He can use almost all weapons and armor.
        
        Almost all Armsman are trained since childhood to master almost all weapons
        and can use each weapon effectively even while wearing heavy armors.  The
        training of Armsmen is passed down from generation to generation and the
        races who most cherish the act of weapondry based combat seem to do the best
        at them, especially the Minotaur, the Ogre and the Hill and Mountain
        Dwarves.  Other races also make good Armsmen, such as Humans, Hobgoblins,
        Half Elves and Half Ogres.  
        
        Who can be an Armsman?
        CLASS:     WARRIORS only
        RACE:      Any.
        ALIGNMENT: Any alignment
        CLAN:      ANY, including non-clanned
        see also: 'RECLASS'`;
        this.castsAtLevel = false;
        this.castingLevelModifier = 0.50;
        this.notes = "Armsman are extremely versatile fighters that tend to be extremely expensive in both tnl to level and eggs for weapons. Armsman do not cast at level.";
        this.cpRacialModifiers = new Map<IRace, number>([
            [Human.GetInstance(), 1.0],
            [HalfElf.GetInstance(), 1.0],
            [WildElf.GetInstance(), 1.0],
            [ShalonestiElf.GetInstance(), 1.0],
            [SeaElf.GetInstance(), 1.0],
            [DarkElf.GetInstance(), 1.0],
            [HillDwarf.GetInstance(), 1.0],
            [MountainDwarf.GetInstance(), 1.0],
            [DarkDwarf.GetInstance(), 1.0],
            [Mul.GetInstance(), 1.0],
            [Ogre.GetInstance(), 1.0],
            [HalfOgre.GetInstance(), 1.0],
            [GiantOgre.GetInstance(), 1.0],
            [Goblin.GetInstance(), 1.0],
            [HobGoblin.GetInstance(), 1.0],
            [Bugbear.GetInstance(), 1.0],
            [TinkerGnome.GetInstance(), 1.0],
            [DeepGnome.GetInstance(), 1.0],
            [Felar.GetInstance(), 1.0],
            [Wemic.GetInstance(), 1.0],
            [Minotaur.GetInstance(), 1.0],
            [Kender.GetInstance(), 1.0],
            [Arboren.GetInstance(), 1.0],
            [Yinn.GetInstance(), 1.0],
        ]);
    }

    // Method to get the single instance of the class
    public static GetInstance(): Armsman {
        if (!Armsman.instance) {
            Armsman.instance = new Armsman();
        }
        return Armsman.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Armsman.GetInstance() as T;
    }
}

export default Armsman;