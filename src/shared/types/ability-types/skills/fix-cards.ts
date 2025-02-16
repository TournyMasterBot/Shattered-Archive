import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class FixCards implements IAbility {
    private static instance: FixCards;

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
        this.name = "Fix Cards";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
FIX CARDS

A charlatan wouldn't be a charlatan without cards. A day doesn't go by that
a charlatan would turn down a card game. So good are they at playing, that
many have learned how to fix the cards themselves while playing, quite
possibly forcing the deck so that they are able to draw exactly the card
they are seeking.

Syntax: draw <card #> <suit>
Example: draw queen hearts

See also: Help Charlatan
`;
        
        if (FixCards.instance === undefined) {
            FixCards.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): FixCards {
        if (!FixCards.instance) {
            FixCards.instance = new FixCards();
        }
        return FixCards.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return FixCards.GetInstance() as T;
    }
}

export default FixCards;