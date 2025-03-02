// #region imports
import { IStatAttribute, StatAttribute, StatAttributeType } from "@shared/types/character-types/stat-attribute";
import DslArmorType from "@shared/types/item-types/armor-type";
import IDslArmorType from "@shared/types/item-types/armor-type-interface";
import { Weaponsmaster } from "@shared/types/ability-types/groups-skills/Weaponsmaster";
import IRace from "@shared/types/character-types/race-interface";
import ArmsmanBasics from "@shared/types/ability-types/groups-class/ArmsmanBasics";
import Axe from "@shared/types/ability-types/skills/Axe";
import MasteryMace from "@shared/types/ability-types/groups-skills/MasteryMace";
import MasterySword from "@shared/types/ability-types/groups-skills/MasterySword";
import MasteryDagger from "@shared/types/ability-types/groups-skills/MasteryDagger";
import Enhancement from "@shared/types/ability-types/groups-spells/Enhancement";
import MasteryPolearm from "@shared/types/ability-types/groups-skills/MasteryPolearm";
import MasteryWhip from "@shared/types/ability-types/groups-skills/MasteryWhip";
import MasteryFlail from "@shared/types/ability-types/groups-skills/MasteryFlail";
import MasterySpear from "@shared/types/ability-types/groups-skills/MasterySpear";
import MasteryAxe from "@shared/types/ability-types/groups-skills/MasteryAxe";
import ArmsmanDefault from "@shared/types/ability-types/groups-class/ArmsmanDefault";
import Transportation from "@shared/types/ability-types/groups-spells/Transportation";
import Flail from "@shared/types/ability-types/skills/flail";
import Whip from "@shared/types/ability-types/skills/whip";
import Staff from "@shared/types/ability-types/skills/staff";
import Riding from "@shared/types/ability-types/skills/riding";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Kick from "@shared/types/ability-types/skills/kick";
import Grip from "@shared/types/ability-types/skills/grip";
import BlindFighting from "@shared/types/ability-types/skills/BlindFighting";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import Bash from "@shared/types/ability-types/skills/Bash";
import DirtKicking from "@shared/types/ability-types/skills/DirtKicking";
import Parry from "@shared/types/ability-types/skills/parry";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Lore from "@shared/types/ability-types/skills/lore";
import Disarm from "@shared/types/ability-types/skills/Disarm";
import Berserk from "@shared/types/ability-types/skills/Berserk";
import Charge from "@shared/types/ability-types/skills/Charge";
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
import Dagger from "@shared/types/ability-types/skills/Dagger";
import Mace from "@shared/types/ability-types/skills/mace";
import Polearm from "@shared/types/ability-types/skills/polearm";
import Spear from "@shared/types/ability-types/skills/spear";
import Sword from "@shared/types/ability-types/skills/sword";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import Backhand from "@shared/types/ability-types/skills/Backhand";
import Summon from "@shared/types/ability-types/spells/summon";
import Sting from "@shared/types/ability-types/skills/sting";
import Rescue from "@shared/types/ability-types/skills/rescue";
import Swim from "@shared/types/ability-types/skills/swim";
import Scrolls from "@shared/types/ability-types/skills/scrolls";
import Staves from "@shared/types/ability-types/skills/staves";
import Wands from "@shared/types/ability-types/skills/wands";
import Recall from "@shared/types/ability-types/skills/recall";
import Dig from "@shared/types/ability-types/skills/Dig";
import Age from "@shared/types/ability-types/skills/Age";
import Armor from "@shared/types/ability-types/spells/armor";
import Stab from "@shared/types/ability-types/skills/stab";
import Refresh from "@shared/types/ability-types/spells/refresh";
import Distance from "@shared/types/ability-types/skills/distance";
import Spin from "@shared/types/ability-types/skills/spin";
import ProtectionEvil from "@shared/types/ability-types/spells/protection-evil";
import ProtectionNeutral from "@shared/types/ability-types/spells/protection-neutral";
import ProtectionGood from "@shared/types/ability-types/spells/protection-good";
import Disembowel from "@shared/types/ability-types/skills/Disembowel";
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
import Protective from "@shared/types/ability-types/groups-spells/Protective";
import Strip from "@shared/types/ability-types/skills/strip";
import Florentine from "@shared/types/ability-types/skills/florentine";
import Cross from "@shared/types/ability-types/skills/Cross";
import Lash from "@shared/types/ability-types/skills/lash";
import ConcealedAttack from "@shared/types/ability-types/skills/ConcealedAttack";
import Entrap from "@shared/types/ability-types/skills/entrap";
import Legsweep from "@shared/types/ability-types/skills/legsweep";
import Drum from "@shared/types/ability-types/skills/drum";
import Flurry from "@shared/types/ability-types/skills/flurry";
import Whirl from "@shared/types/ability-types/skills/whirl";
import Choke from "@shared/types/ability-types/skills/Choke";
import Chargeset from "@shared/types/ability-types/skills/Chargeset";
import Boneshatter from "@shared/types/ability-types/skills/Boneshatter";
import ShieldCleave from "@shared/types/ability-types/skills/shield-cleave";
import ServerCache from "@shared/cache/server-cache";
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
        this.id = MortalClass.Armsman.id;
        this.name = this.constructor.name;
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
        // Verified against ShatteredArchive 2025-02-19
        this.abilities = new Map<number, IAbility[]>([
            [1, [
                Axe.GetInstance(),
                Dagger.GetInstance(),
                Flail.GetInstance(),
                Mace.GetInstance(),
                Polearm.GetInstance(),
                ShieldBlock.GetInstance(),
                Spear.GetInstance(),
                Sword.GetInstance(),
                Staff.GetInstance(),
                Whip.GetInstance(),
                Bash.GetInstance(),
                EnhancedDamage.GetInstance(),
                Parry.GetInstance(),
                Rescue.GetInstance(),
                Swim.GetInstance(),
                Scrolls.GetInstance(),
                Staves.GetInstance(),
                Wands.GetInstance(),
                Recall.GetInstance(),
                Dig.GetInstance(),
                Age.GetInstance()
            ]],
            [2, [Riding.GetInstance()]],
            [3, [DirtKicking.GetInstance()]],
            [5, [
                SecondAttack.GetInstance(),
                Armor.GetInstance()
            ]],
            [6, [
                HandToHand.GetInstance(),
                FastHealing.GetInstance()
            ]],
            [8, [
                Kick.GetInstance(),
                Stab.GetInstance()
            ]],
            [9, [
                Strip.GetInstance(),
                Florentine.GetInstance(),
                Refresh.GetInstance()
            ]],
            [10, [
                Backhand.GetInstance(),
                Distance.GetInstance()
            ]],
            [11, [
                Disarm.GetInstance(),
                Spin.GetInstance(),
                ProtectionEvil.GetInstance(),
                ProtectionNeutral.GetInstance(),
                ProtectionGood.GetInstance()
            ]],
            [12, [
                ThirdAttack.GetInstance(),
                Disembowel.GetInstance()
            ]],
            [13, [
                BlindFighting.GetInstance(),
                Dodge.GetInstance(),
            ]],
            [14, [
                Haggle.GetInstance(),
                Peek.GetInstance()
            ]],
            [15, [
                Trip.GetInstance(),
                Meditation.GetInstance()
            ]],
            [16, [
                Yank.GetInstance(),
                Fireproof.GetInstance(),
                Infravision.GetInstance(),
                WordOfRecall.GetInstance()
            ]],
            [17, [
                Grip.GetInstance(),
            ]],
            [18, [
                Berserk.GetInstance(),
                Fireproof.GetInstance()
            ]],
            [19, [Charge.GetInstance()]],
            [20, [
                Lore.GetInstance(),
                Sting.GetInstance(), 
                GiantStrength.GetInstance()
            ]],
            [21, [EnhancedReactions.GetInstance()]],
            [22, [
                DualWield.GetInstance(),
                Fly.GetInstance(),
                Summon.GetInstance(),
                LightFoot.GetInstance()
            ]],
            [23, [
                Cross.GetInstance(),
            ]],
            [24, [
                Lash.GetInstance(),
            ]],
            [25, [
                PickLock.GetInstance(),
            ]],
            [26, [
                ConcealedAttack.GetInstance()
            ]],
            [27, [
                Entrap.GetInstance()
            ]],
            [28, [
                FourthAttack.GetInstance(),
                Gate.GetInstance()
            ]],
            [29, [Haste.GetInstance()]],
            [30, [
                Legsweep.GetInstance(),
                Sanctuary.GetInstance()
            ]],
            [33, [
                Drum.GetInstance(),
            ]],
            [34, [
                Flurry.GetInstance(),
                Cancellation.GetInstance()
            ]],
            [35, [
                Whirl.GetInstance(),
            ]],
            [36, [
                Teleport.GetInstance()
            ]],
            [37, [
                Choke.GetInstance(),
                PassDoor.GetInstance()
            ]],
            [39, [
                Chargeset.GetInstance(),
                Waypoint.GetInstance()
            ]],
            [40, [
                Portal.GetInstance(),
                Shield.GetInstance()
            ]],
            [41, [
                Boneshatter.GetInstance(),
                ShieldCleave.GetInstance()
            ]],
            [43, [Entwine.GetInstance()]],
            [44, [Hurl.GetInstance()]],
            [45, [
                Impale.GetInstance(),
                Nexus.GetInstance(),
                StoneSkin.GetInstance()
            ]]
        ]);
        // Verified against ShatteredArchive 2025-02-19
        this.characterCreationAbilityGroups = {
            [Weaponsmaster.GetInstance().name]: 20,
            [Transportation.GetInstance().name]: 8,
            [MasteryMace.GetInstance().name]: 9,
            [MasterySword.GetInstance().name]: 9,
            [MasteryDagger.GetInstance().name]: 9,
            [Enhancement.GetInstance().name]: 9,
            [ArmsmanBasics.GetInstance().name]: 0,
            [ArmsmanDefault.GetInstance().name]: 40,
            [MasteryPolearm.GetInstance().name]: 9,
            [MasteryWhip.GetInstance().name]: 9,
            [Protective.GetInstance().name]: 9,
            [MasteryFlail.GetInstance().name]: 9,
            [MasterySpear.GetInstance().name]: 9,
            [MasteryAxe.GetInstance().name]: 9
        }

        // Verified against ShatteredArchive 2025-02-19
        this.characterCreationSkills = {
            [Axe.GetInstance().name]: 3,
            [Mace.GetInstance().name]: 3,
            [Spear.GetInstance().name]: 3,
            [Bash.GetInstance().name]: 4,
            [DirtKicking.GetInstance().name]: 4,
            [DualWield.GetInstance().name]: 6,
            [Kick.GetInstance().name]: 3,
            [Trip.GetInstance().name]: 8,
            [FastHealing.GetInstance().name]: 4,
            [Meditation.GetInstance().name]: 8,
            [Riding.GetInstance().name]: 2,
            [EnhancedReactions.GetInstance().name]: 4,
            [Dagger.GetInstance().name]: 4,
            [Polearm.GetInstance().name]: 4,
            [Staff.GetInstance().name]: 6,
            [Berserk.GetInstance().name]: 5,
            [Disarm.GetInstance().name]: 4,
            [EnhancedDamage.GetInstance().name]: 3,
            [Parry.GetInstance().name]: 4,
            [ThirdAttack.GetInstance().name]: 4,
            [Haggle.GetInstance().name]: 6,
            [Peek.GetInstance().name]: 6,
            [Charge.GetInstance().name]: 5,
            [Flail.GetInstance().name]: 4,
            [ShieldBlock.GetInstance().name]: 2,
            [Whip.GetInstance().name]: 4,
            [BlindFighting.GetInstance().name]: 3,
            [Dodge.GetInstance().name]: 6,
            [HandToHand.GetInstance().name]: 4,
            [Rescue.GetInstance().name]: 4,
            [FourthAttack.GetInstance().name]: 6,
            [Lore.GetInstance().name]: 4,
            [PickLock.GetInstance().name]: 8,
            [Grip.GetInstance().name]: 4
        }

        // Verified against ShatteredArchive 2025-02-19
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
        this.isMoonAffected = false;
        this.castingLevelModifier = 0.50;
        this.notes = "Armsman are extremely versatile fighters that tend to be extremely expensive in both tnl to level and eggs for weapons. Armsman do not cast at level.";
        // Verified against ShatteredArchive 2025-02-19
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
            ServerCache.Classes[this.instance.name] = this.instance
        }
        return Armsman.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Armsman.GetInstance() as T;
    }
}

export default Armsman;