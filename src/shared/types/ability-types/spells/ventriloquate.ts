import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Ventriloquate implements IAbility {
  private static instance: Ventriloquate;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Ventriloquate";
    this.helpFile = `help Ventriloquate
VENTRILOQUATE
VENTRILOQUATE

Syntax: cast ventriloquate <speaker> <message>

This spell throws your voice, making it appear that some other object or
character in the room is saying your message.

Victims who make their saving throw will know that someone is using
ventriloquism, but not who. Victims who fail their saving throw will think
that the object or character really did say your message.

See also - ILLUSION`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Ventriloquate.instance === undefined) {
      Ventriloquate.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Ventriloquate {
    if (!Ventriloquate.instance) {
      Ventriloquate.instance = new Ventriloquate();
    }
    return Ventriloquate.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Ventriloquate.GetInstance() as T;
  }
}

export default Ventriloquate;
