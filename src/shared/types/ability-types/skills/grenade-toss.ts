import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class GrenadeToss implements IAbility {
  private static instance: GrenadeToss;

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
    this.helpFile = `grenade castiron glass pistolball stinkball gignite gtoss
GRENADE CASTIRON GLASS PISTOLBALL STINKBALL GIGNITE GTOSS
 
Syntax: gignite <grenadetype>
 
Syntax: gtoss <direction> <target>
 
Only pirates can use grenades. There are four types of grenade a pirate can
carry in his or her arsenal, and each kind provides a different type of area
effect.
 
Cast Iron: These grenades do a small amount of explosive damage, followed by
shrapnel damage.
 
Glass: Glass grenades cause concussive damage, stunning and deafening your
opponent for a short amount of time.
 
Pistolball: Pistolball grenades are packed with shot, so they do a large amount
of damage in one short burst.
 
Stinkball: The gases emitted from the stinkball are enough to drive an opponent
out of the room. The eye-watering effect also makes it more difficult
for him or her to accurately hit in a fight. Goblins, hobgoblins and
bugbears enjoy the stench, so the stinkball has no effect on them.`;

    if (GrenadeToss.instance === undefined) {
      GrenadeToss.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): GrenadeToss {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GrenadeToss.GetInstance() as T;
  }
}

export default GrenadeToss;
