import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Sword implements IAbility {
  private static instance: Sword;

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
    this.name = "Sword";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `
help sword
EXOTIC WEAPONS WEAPON WEAPONSMASTER AXE DAGGER FLAIL MACE POLEARM SPEAR STAFF SWORD WHIP
Each weapon skill applies to a specific group of armaments, and determines how
well a character fights with a particular weapon. The weaponsmaster group
provides talent in all weapons (save exotics), from chair legs to halberds.
The weapon skills consist of the following:
weaponsmaster   skill group of all weapons listed below (save exotic weaponry)
axe             the use of axes, ranging from hand to great (but not halberds)
dagger          the use of knives and daggers, and other stabbing weapons
flail           skill in ball-and-chain type weapons
mace            this skill includes clubs and hammers as well as maces
polearm         the use of pole weapons (except spears), including halberds
spear           this skill covers long pointed weapons, but not polearms
staff           the staff skill covers long blunt weapons
sword           the warrior's standby, from rapier to claymore
whip            the use of whips, chains, and bullwhips
exotic          the use of strange magical weapons
The exotic skill cannot be purchased, and is dependent solely upon level.
`;
    if (Sword.instance === undefined) {
      Sword.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Sword {
    if (!Sword.instance) {
      Sword.instance = new Sword();
    }
    return Sword.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Sword.GetInstance() as T;
  }
}

export default Sword;
