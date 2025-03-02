import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Envenom implements IAbility {
  private static instance: Envenom;

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
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `'ENVENOM'

Syntax: Envenom <item>

The envenom skill is a cowardly skill practiced only by thieves, designed to
win a battle through alchemy and treachery rather than skill or strength. 
Or, put another way, it's a skill used by the smart to kill the foolish.  

Food, drink, and weapons may be envenomed through alchemy with varying
effects. Poisoned food or drink puts a mild poison spell on the consumer,
and is unlikely to be more than a minor inconvenience (after all, the typical
adventurer could drink sewer water with only a trace of the runs).

A poisoned weapon, on the other hand, can inflict damage on an opponent as
the poison burns through his bloodstream. But be careful, blade venom
evaporates quickly and is rendered almost powerless by repeated blows in
combat. Weapons that already possess a flag cannot be envenomed.`;

    if (Envenom.instance === undefined) {
      Envenom.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Envenom {
    if (!Envenom.instance) {
      Envenom.instance = new Envenom();
    }
    return Envenom.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Envenom.GetInstance() as T;
  }
}

export default Envenom;
