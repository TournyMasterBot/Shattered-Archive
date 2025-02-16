import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CharmPerson implements IAbility {
  private static instance: CharmPerson;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Charm Person";
    this.helpFile = `
help charm person
'CHARM PERSON'
CHARM PERSON

Syntax: cast 'charm person' <victim>

This spell, if successful, causes the victim to follow you and to take
orders from you.  

Use ORDER to order your charmed followers.  

You are responsible for the actions of your followers.  Conversely, other
people who attack your followers will be penalized as if they attacked you. 
Characters who are charmed must be given an opportunity to enter their own
commands.  The ratio of commands between the charmer and the charmee must be
at least 1:1.  That is if you issue a command to someone you have charmed,
you must provide them with the time to issue their own command before
issuing a second order.  

Charm can not be used by Giants in order to aid in training.  The following
actions are illegal to order players and charmies to do:

1.  Ordering players to make suggestive comments on channels.  
2.  Charming out of range to allow the other player to gain experience.  
3.  Order a player to attack another player who is out of his/her PK range. 
4.  Order a player more than once every 2 rounds.  
5.  Order a player or mob to do anything that goes around the +/- 8 level
    range.
6.  Dismiss charmed game mobs in order to make them disappear.  
    That YOU did NOT create yourself.
7.  Ordering a player to cast any skill/spell with the intent to lag the
    player.  This also includes casting holy word/nexus.
8.  Order someone to do something out of character.  
9.  Order players to drop a number of items, IE: order all drop 100 vial.  
10. Order a player to put all into a container, then ordering that
    container given to you.
11. Order a player to change their title.
12. Have a mob/charmie named similar to your own, or creating a character
    with a name similar to a mob/charmie.
13. Order to cleanse.
14. Charm your own clanmates in order to prevent them from being charmed by
    enemies.
15. Order funds withdrawn from a bank.
 
See also - BEGUILING
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CharmPerson.instance === undefined) {
      CharmPerson.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CharmPerson {
    if (!CharmPerson.instance) {
      CharmPerson.instance = new CharmPerson();
    }
    return CharmPerson.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CharmPerson.GetInstance() as T;
  }
}

export default CharmPerson;
