import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Scrolls implements IAbility {
    private static instance: Scrolls;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Scrolls";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `help scroll
BRANDISH QUAFF RECITE ZAP WAND STAFF SCROLL POTION
BRANDISH QUAFF RECITE ZAP WAND STAFF SCROLL POTION
Syntax: brandish <target>
Syntax: quaff    <potion>
Syntax: recite   <scroll> <target>
Syntax: zap      <target>
Syntax: zap
BRANDISH brandishes a magical staff.  QUAFF quaffs a magical potion (as opposed
to DRINK, which drinks mundane liquids).  RECITE recites a magical scroll; the
<target> is optional, depending on the nature of the scroll.  ZAP zaps a
magical wand at a target.  If the target is not specified, and you are fighting
someone, then that character is used for a target.
You must HOLD a wand or a staff before using BRANDISH or ZAP.
All of these commands use up their objects.  Potions and scrolls have a single
charge.  Wands and staves have multiple charges.  When a magical object has no
more charges, it will be consumed.
These commands may require an item skill to be successful, see the help entries
on the skills scrolls, staves, and wands for more information.

SCROLL 'SCROLL COMMAND'
SCROLL 'SCROLL COMMAND'
Syntax: scroll
Syntax: scroll <number>
This command changes the number of lines the mud sends you in a page (the 
default is 24 lines).  Change this to a higher number for larger screen
sizes, or to 0 to disabling paging.`;
        if (Scrolls.instance === undefined) {
            Scrolls.instance = this;
        }
    }
    // Method to get the single instance of the class
    public static GetInstance(): Scrolls {
        if (!Scrolls.instance) {
            Scrolls.instance = new Scrolls();
        }
        return Scrolls.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Scrolls.GetInstance() as T;
    }
}

export default Scrolls;